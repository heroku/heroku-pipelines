'use strict';

let cli          = require('heroku-cli-util');
let disambiguate = require('../../lib/disambiguate');
let co           = require('co');
var bluebird     = require('bluebird');
var request      = bluebird.promisify(require('request'));
var _            = require('lodash');

const PROMOTION_ORDER = ['development', 'staging', 'production'];
const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

// Helper functions

function kolkrabbiRequest(url, token) {
  return request({
    method: 'GET',
    url: url,
    headers: {
      authorization: 'Bearer ' + token
    },
    json: true
  }).spread(function (res, body) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error('failed to fetch diff because of an internal server error...');
    }
    return body;
  });
}

function *getLatestCommitHash(heroku, appName, appId) {
  const release = yield heroku.request({
    method: 'GET',
    path: `/apps/${appId}/releases`,
    headers: { 'Accept': V3_HEADER, 'Range': 'version ..; order=desc,max=1' },
    partial: true
  });
  const slug = yield heroku.request({
    method: 'GET',
    path: `/apps/${appId}/slugs/${release[0].slug.id}`,
    headers: { 'Accept': V3_HEADER }
  });
  return { name: appName, hash: slug.commit };
}

function *diff(sourceApp, downstreamApp, repo, githubToken, herokuUserAgent) {
  if (sourceApp.hash === downstreamApp.hash) {
    console.log(`\neverything is up to date between ${sourceApp.name} and ${downstreamApp.name}`);
    return;
  }
  const diff = yield request({
    url: `https://api.github.com/repos/${repo}/compare/${downstreamApp.hash}...${sourceApp.hash}`,
    headers: {
      authorization: 'token ' + githubToken,
      'user-agent': herokuUserAgent,
    },
    json: true
  }).get(1);

  console.log(`\n${sourceApp.name} is ahead of ${downstreamApp.name} by ${diff.ahead_by} commit${diff.ahead_by === 1 ? '' : 's'}:`);
  for (let i = diff.commits.length - 1; i >= 0; i--) {
    let commit = diff.commits[i];
    let abbreviatedHash = commit.sha.substring(0, 7);
    let authoredDate = commit.commit.author.date;
    let authorName = commit.commit.author.name;
    let message = commit.commit.message.split('\n')[0];
    console.log(`  ${abbreviatedHash}  ${authoredDate}  ${message} (${authorName})`);
  }
}

module.exports = {
  topic: 'pipelines',
  command: 'diff',
  description: 'TODO',
  help: 'TODO',
  needsAuth: true,
  needsApp: true,
  run: cli.command(function* (context, heroku) {
    const targetAppName = context.app;
    const coupling = yield heroku.request({
      method: 'GET',
      path: `/apps/${targetAppName}/pipeline-couplings`,
      headers: { 'Accept': PIPELINES_HEADER }
    });
    const targetAppId = coupling.app.id;

    const allApps = yield cli.action(`Fetching apps from pipeline`,
      heroku.request({
        method: 'GET',
        path: `/pipelines/${coupling.pipeline.id}/apps`,
        headers: { 'Accept': PIPELINES_HEADER }
      }));

    const sourceStage = coupling.stage;
    const downstreamStage = PROMOTION_ORDER[PROMOTION_ORDER.indexOf(sourceStage) + 1];
    if (downstreamStage === null || PROMOTION_ORDER.indexOf(sourceStage) < 0) {
      throw new Error(`Unable to diff ${targetAppName}`);
    }
    const downstreamApps = allApps.filter(function(app) {
      return app.coupling.stage === downstreamStage;
    });

    if (downstreamApps.length < 1) {
      throw new Error(`Cannot diff ${targetAppName} as there are no downstream apps configured`);
    }

    // Fetch the hash of the latest release for {target, downstream[0], .., downstream[n]} apps.
    const wrappedGetLatestCommitHash = co.wrap(_.partial(getLatestCommitHash, heroku));
    const targetHash = yield cli.action(`Fetching latest app release for target app`,
      wrappedGetLatestCommitHash(targetAppName, targetAppId));
    const downstreamHashes = yield cli.action(`Fetching latest app releases for downstream apps`,
        bluebird.all(downstreamApps.map(function (app) {
          return wrappedGetLatestCommitHash(app.name, app.id)
        })));

    // Try to refrain from doing any GitHub/kolkrabbi API requests if none of the downstream
    // hashes differ from the target hash.
    const uniqueDownstreamHashes = _.uniq(_.pluck(downstreamHashes, 'hash'));
    if (uniqueDownstreamHashes.length === 1 && uniqueDownstreamHashes[0] === targetHash.hash) {
      console.log(`\nEverything is up to date.`);
      return;
    }

    const githubAccount = yield kolkrabbiRequest(
      `https://kolkrabbi.heroku.com/account/github/token`, heroku.options.token);
    const githubApp = yield kolkrabbiRequest(
      `https://kolkrabbi.heroku.com/apps/${coupling.app.id}/github`, heroku.options.token);

    for (const downstreamHash of downstreamHashes) {
      yield diff(targetHash, downstreamHash,
        githubApp.repo, githubAccount.github.token, heroku.options.userAgent);
    }
  })
};
