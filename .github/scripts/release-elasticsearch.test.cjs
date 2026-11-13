'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const releaseElasticsearch = require('./release-elasticsearch.cjs');
const { versionUpdate } = releaseElasticsearch;

const fullName = 'lyiase/elasticsearch-japanese';
const head = 'a'.repeat(40);
const merged = 'b'.repeat(40);
const image = 'docker.elastic.co/elasticsearch/elasticsearch';

function dockerfileChange(previous = '9.5.5', next = '9.5.6') {
  return {
    filename: 'Dockerfile', status: 'modified', additions: 1, deletions: 1,
    patch: `@@ -1,3 +1,3 @@\n-FROM ${image}:${previous}\n+FROM ${image}:${next}\n RUN elasticsearch-plugin install --batch analysis-kuromoji \\\n     && elasticsearch-plugin install --batch analysis-icu`,
  };
}

function fixture() {
  const state = {
    files: [dockerfileChange()], tag: null, release: null, failRelease: false,
    failDispatch: false, refuseMerge: false,
    pr: {
      number: 19, user: { login: 'dependabot[bot]' }, state: 'open', draft: false,
      merged: false, merge_commit_sha: null,
      html_url: `https://github.com/${fullName}/pull/19`,
      head: { sha: head, repo: { full_name: fullName } },
      base: { ref: 'main', repo: { full_name: fullName } },
    },
  };
  const writes = [];
  const logs = [];
  const notFound = () => { throw Object.assign(new Error('Not found'), { status: 404 }); };
  const context = {
    repo: { owner: 'lyiase', repo: 'elasticsearch-japanese' },
    payload: { workflow_run: {
      event: 'pull_request', conclusion: 'success', head_sha: head,
      head_repository: { full_name: fullName },
      pull_requests: [{ number: 19, head: { sha: head } }],
    } },
  };
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: state.pr }),
        listFiles: async () => ({ data: state.files }),
        merge: async args => {
          writes.push(['merge', args]);
          if (state.refuseMerge) return { data: { merged: false, message: 'Blocked' } };
          state.pr.merged = true;
          state.pr.state = 'closed';
          state.pr.merge_commit_sha = merged;
          return { data: { merged: true, sha: merged } };
        },
      },
      git: {
        getRef: async () => state.tag ? { data: state.tag } : notFound(),
        getTag: async () => ({ data: { object: { type: 'commit', sha: merged } } }),
      },
      repos: {
        listPullRequestsAssociatedWithCommit: async () => ({ data: [state.pr] }),
        getReleaseByTag: async () => state.release ? { data: state.release } : notFound(),
        createRelease: async args => {
          writes.push(['release', args]);
          if (state.failRelease) throw new Error('Release service unavailable');
          state.tag = { object: { type: 'commit', sha: args.target_commitish } };
          state.release = {
            ...args, html_url: `https://github.com/${fullName}/releases/tag/${args.tag_name}`,
          };
          return { data: state.release };
        },
      },
      actions: {
        createWorkflowDispatch: async args => {
          writes.push(['dispatch', args]);
          if (state.failDispatch) throw new Error('Dispatch service unavailable');
        },
      },
    },
    paginate: async (method, args) => (await method(args)).data,
  };
  const run = () => releaseElasticsearch({ github, context, core: { info: message => logs.push(message) } });
  return { state, writes, logs, context, github, run };
}

test('accepts stable patch, minor, and major upgrades using numeric comparison', () => {
  for (const [previous, next] of [['9.5.5', '9.5.6'], ['9.9.9', '9.10.0'], ['9.5.6', '10.0.0']]) {
    assert.deepEqual(versionUpdate([dockerfileChange(previous, next)]), { previous, next, tag: `v${next}` });
  }
});

test('rejects unchanged versions, downgrades, prereleases, digests, and unexpected images', () => {
  for (const next of ['9.5.5', '9.5.4', '8.99.99', '9.5.6-rc1', '9.5.6@sha256:abc', 'latest', '9.05.6']) {
    assert.equal(versionUpdate([dockerfileChange('9.5.5', next)]), null);
  }
  const file = dockerfileChange();
  file.patch = file.patch.replaceAll(image, 'example.com/elasticsearch');
  assert.equal(versionUpdate([file]), null);
});

test('rejects extra files, missing patches, renames, and extra Dockerfile commands', () => {
  const file = dockerfileChange();
  for (const files of [[], [file, { filename: 'README.md' }], [{ ...file, patch: undefined }],
    [{ ...file, filename: 'other/Dockerfile' }], [{ ...file, status: 'renamed' }],
    [{ ...file, additions: 2, patch: `${file.patch}\n+RUN echo unexpected` }],
    [{ ...file, patch: `${file.patch}\n+RUN echo unexpected` }]]) {
    assert.equal(versionUpdate(files), null);
  }
});

test('squash-merges the tested head, creates the versioned release, and dispatches at its tag', async () => {
  const f = fixture();
  await f.run();
  assert.deepEqual(f.writes.map(([operation]) => operation), ['merge', 'release', 'dispatch']);
  assert.equal(f.writes[0][1].merge_method, 'squash');
  assert.equal(f.writes[0][1].sha, head);
  assert.equal(f.writes[1][1].target_commitish, merged);
  assert.equal(f.writes[1][1].tag_name, 'v9.5.6');
  assert.equal(f.writes[1][1].name, 'v9.5.6');
  assert.equal(f.writes[1][1].draft, false);
  assert.equal(f.writes[1][1].prerelease, false);
  assert.equal(f.writes[2][1].workflow_id, 'publish-dockerhub.yaml');
  assert.equal(f.writes[2][1].ref, 'v9.5.6');
});

for (const [description, mutate] of [
  ['a failed build', f => { f.context.payload.workflow_run.conclusion = 'failure'; }],
  ['a cancelled build', f => { f.context.payload.workflow_run.conclusion = 'cancelled'; }],
  ['a non-PR build', f => { f.context.payload.workflow_run.event = 'push'; }],
  ['a fork build', f => { f.context.payload.workflow_run.head_repository.full_name = 'other/fork'; }],
  ['a human-authored PR', f => { f.state.pr.user.login = 'lyiase'; }],
  ['a fork PR', f => { f.state.pr.head.repo.full_name = 'other/fork'; }],
  ['another base branch', f => { f.state.pr.base.ref = 'release'; }],
  ['a draft PR', f => { f.state.pr.draft = true; }],
  ['a newer untested PR commit', f => { f.state.pr.head.sha = 'c'.repeat(40); }],
  ['a closed unmerged PR', f => { f.state.pr.state = 'closed'; }],
  ['an unrelated file change', f => { f.state.files.push({ filename: 'README.md' }); }],
]) {
  test(`does not merge or publish ${description}`, async () => {
    const f = fixture();
    mutate(f);
    await f.run();
    assert.deepEqual(f.writes, []);
  });
}

test('resolves the PR through GitHub when the workflow payload omits pull_requests', async () => {
  const f = fixture();
  f.context.payload.workflow_run.pull_requests = [];
  await f.run();
  assert.deepEqual(f.writes.map(([operation]) => operation), ['merge', 'release', 'dispatch']);
});

test('does not merge if the validated commit is associated with multiple PRs', async () => {
  const f = fixture();
  f.context.payload.workflow_run.pull_requests.push({ number: 20, head: { sha: head } });
  await f.run();
  assert.deepEqual(f.writes, []);
});

test('does not publish if GitHub refuses the merge', async () => {
  const f = fixture();
  f.state.refuseMerge = true;
  await assert.rejects(f.run, /not merged/);
  assert.deepEqual(f.writes.map(([operation]) => operation), ['merge']);
});

test('an existing version tag prevents merging an open PR', async () => {
  const f = fixture();
  f.state.tag = { object: { type: 'commit', sha: 'c'.repeat(40) } };
  await assert.rejects(f.run, /leaving the PR unmerged/);
  assert.deepEqual(f.writes, []);
});

test('resumes release creation after a merge succeeded but release creation failed', async () => {
  const f = fixture();
  f.state.failRelease = true;
  await assert.rejects(f.run, /Release service unavailable/);
  f.state.failRelease = false;
  f.writes.length = 0;
  await f.run();
  assert.deepEqual(f.writes.map(([operation]) => operation), ['release', 'dispatch']);
});

test('reuses the existing release when retrying a failed dispatch', async () => {
  const f = fixture();
  f.state.failDispatch = true;
  await assert.rejects(f.run, /Dispatch service unavailable/);
  f.state.failDispatch = false;
  f.writes.length = 0;
  await f.run();
  assert.deepEqual(f.writes.map(([operation]) => operation), ['dispatch']);
});

test('refuses to publish an existing tag pointing at another commit on retry', async () => {
  const f = fixture();
  await f.run();
  f.state.tag.object.sha = 'c'.repeat(40);
  f.writes.length = 0;
  await assert.rejects(f.run, /different commit/);
  assert.deepEqual(f.writes, []);
});

test('supports an annotated version tag on retry', async () => {
  const f = fixture();
  await f.run();
  f.state.tag.object = { type: 'tag', sha: 'd'.repeat(40) };
  f.writes.length = 0;
  await f.run();
  assert.deepEqual(f.writes.map(([operation]) => operation), ['dispatch']);
});

test('does not replace an existing prerelease on retry', async () => {
  const f = fixture();
  await f.run();
  f.state.release.prerelease = true;
  f.writes.length = 0;
  await assert.rejects(f.run, /draft or prerelease/);
  assert.deepEqual(f.writes, []);
});

test('surfaces permission errors instead of treating them as missing tags', async () => {
  const f = fixture();
  f.github.rest.git.getRef = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
  await assert.rejects(f.run, /Forbidden/);
  assert.deepEqual(f.writes, []);
});
