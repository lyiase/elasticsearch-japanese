'use strict';

const FROM = /^FROM docker\.elastic\.co\/elasticsearch\/elasticsearch:((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

function versionUpdate(files) {
  if (files.length !== 1) return null;
  const file = files[0];
  if (file.filename !== 'Dockerfile' || file.status !== 'modified' ||
      file.additions !== 1 || file.deletions !== 1 || !file.patch) return null;

  const changes = file.patch.split('\n').filter(line => /^[+-]/.test(line));
  if (changes.length !== 2 || !changes[0].startsWith('-') || !changes[1].startsWith('+')) return null;
  const previous = FROM.exec(changes[0].slice(1))?.[1];
  const next = FROM.exec(changes[1].slice(1))?.[1];
  if (!previous || !next) return null;

  const oldParts = previous.split('.').map(BigInt);
  const newParts = next.split('.').map(BigInt);
  const changed = newParts.findIndex((part, index) => part !== oldParts[index]);
  if (changed === -1 || newParts[changed] < oldParts[changed]) return null;
  return { previous, next, tag: `v${next}` };
}

async function optional(request) {
  try {
    return (await request()).data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function releaseElasticsearch({ github, context, core }) {
  const run = context.payload.workflow_run;
  const repo = context.repo;
  const fullName = `${repo.owner}/${repo.repo}`;
  const skip = reason => core.info(`Skipping release: ${reason}`);
  if (run.event !== 'pull_request' || run.conclusion !== 'success' ||
      run.head_repository?.full_name !== fullName) return skip('not a successful local PR validation');

  // Resolve from GitHub rather than accepting PR numbers from build artifacts.
  const candidates = run.pull_requests?.length ? run.pull_requests : await github.paginate(
    github.rest.repos.listPullRequestsAssociatedWithCommit,
    { ...repo, commit_sha: run.head_sha, per_page: 100 },
  );
  const matching = candidates.filter(pr => pr.head?.sha === run.head_sha);
  if (matching.length !== 1) return skip('could not identify exactly one validated PR');

  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: matching[0].number });
  if (pr.user.login !== 'dependabot[bot]' || pr.head.repo?.full_name !== fullName ||
      pr.base.ref !== 'main' || pr.base.repo.full_name !== fullName || pr.draft) {
    return skip('not an eligible Dependabot PR to main');
  }
  if (pr.head.sha !== run.head_sha) return skip('the PR changed after validation');
  if (pr.state !== 'open' && !pr.merged) return skip('the PR was closed without merging');

  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...repo, pull_number: pr.number, per_page: 100,
  });
  const update = versionUpdate(files);
  if (!update) return skip('changes are not a stable Elasticsearch version upgrade only');

  const tagRef = await optional(() => github.rest.git.getRef({ ...repo, ref: `tags/${update.tag}` }));
  // An existing version must never be overwritten, even before merging the PR.
  if (!pr.merged && tagRef) throw new Error(`${update.tag} already exists; leaving the PR unmerged`);

  let target = pr.merge_commit_sha;
  if (!pr.merged) {
    const { data: merge } = await github.rest.pulls.merge({
      ...repo, pull_number: pr.number, merge_method: 'squash', sha: run.head_sha,
    });
    if (!merge.merged) throw new Error(`PR #${pr.number} was not merged: ${merge.message}`);
    target = merge.sha;
  }
  if (!target) throw new Error('GitHub did not return the merged commit SHA');

  if (tagRef) {
    let object = tagRef.object;
    // Support both lightweight tags and annotated tags on a retry.
    while (object.type === 'tag') {
      object = (await github.rest.git.getTag({ ...repo, tag_sha: object.sha })).data.object;
    }
    if (object.type !== 'commit' || object.sha !== target) {
      throw new Error(`${update.tag} points to a different commit; refusing to publish`);
    }
  }

  let release = await optional(() => github.rest.repos.getReleaseByTag({ ...repo, tag: update.tag }));
  if (release && (release.draft || release.prerelease)) {
    throw new Error(`${update.tag} already has a draft or prerelease; check it manually`);
  }
  if (!release) {
    ({ data: release } = await github.rest.repos.createRelease({
      ...repo,
      tag_name: update.tag,
      target_commitish: target,
      name: update.tag,
      body: `Update Elasticsearch from ${update.previous} to ${update.next}.\n\n${pr.html_url}`,
      draft: false,
      prerelease: false,
    }));
  }

  // GITHUB_TOKEN-created releases do not trigger release workflows. Dispatch explicitly
  // at the tag so checkout and docker/metadata-action use the released version.
  await github.rest.actions.createWorkflowDispatch({
    ...repo, workflow_id: 'publish-dockerhub.yaml', ref: update.tag,
  });
  core.info(`Published ${release.html_url}; requested Docker Hub publishing for ${update.tag}`);
}

module.exports = releaseElasticsearch;
module.exports.versionUpdate = versionUpdate;
