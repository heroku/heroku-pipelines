'use strict';

let cli          = require('heroku-cli-util');
let co           = require('co');
let bluebird     = require('bluebird');
let request      = bluebird.promisify(require('request'));
let _            = require('lodash');

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
    if (res.statusCode === 404) {
      let err = new Error('404');
      err.name = 'NOT_FOUND';
      throw err;
    } else if (res.statusCode >= 400) {
      // TODO: This could potentially catch some 4xx errors that we might want to handle with a
      // specific error message.
      throw new Error('failed to fetch diff because of an internal server error.');
    }
    return body;
  });
}

function* getLatestCommitHash(heroku, appName, appId) {
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

function* diff(sourceApp, downstreamApp, repo, githubToken, herokuUserAgent) {
  if (sourceApp.hash === downstreamApp.hash) {
    console.log(`\neverything is up to date between ${sourceApp.name} and ${downstreamApp.name}`);
    return;
  }
  const githubDiff = yield request({
    url: `https://api.github.com/repos/${repo}/compare/${downstreamApp.hash}...${sourceApp.hash}`,
    headers: {
      authorization: 'token ' + githubToken,
      'user-agent': herokuUserAgent,
    },
    json: true
  }).get(1);

  console.log(`\n${sourceApp.name} is ahead of ${downstreamApp.name} by ${githubDiff.ahead_by} commit${githubDiff.ahead_by === 1 ? '' : 's'}:`);
  for (let i = githubDiff.commits.length - 1; i >= 0; i--) {
    let commit = githubDiff.commits[i];
    let abbreviatedHash = commit.sha.substring(0, 7);
    let authoredDate = commit.commit.author.date;
    let authorName = commit.commit.author.name;
    let message = commit.commit.message.split('\n')[0];
    console.log(`  ${abbreviatedHash}  ${authoredDate}  ${message} (${authorName})`);
  }
}

function* fetchPipelineCoupling(heroku, appName) {
  try {
    return yield heroku.request({
      method: 'GET',
      path: `/apps/${appName}/pipeline-couplings`,
      headers: { 'Accept': PIPELINES_HEADER }
    });
  } catch (err) {
    console.log(err);
    throw new Error(`This app (${appName}) does not seem to be a part of any pipeline.`);
  }
}

module.exports = {
  topic: 'pipelines',
  command: 'diff',
  description: 'compares the latest release of this app its downstream app(s)',
  needsAuth: true,
  needsApp: true,
  run: cli.command(function* (context, heroku) {
    const targetAppName = context.app;
    const coupling = yield fetchPipelineCoupling(heroku, targetAppName);
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
          return wrappedGetLatestCommitHash(app.name, app.id);
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

    let githubApp;
    try {
      githubApp = yield kolkrabbiRequest(
        `https://kolkrabbi.heroku.com/apps/${targetAppId}/github`, heroku.options.token);
    } catch (err) {
      if (err.name === 'NOT_FOUND') {
        throw new Error(`The target app (${targetAppName}) needs to be connected to GitHub!`);
      }
      throw err;
    }

    for (let downstreamHash of downstreamHashes) {
      yield diff(targetHash, downstreamHash,
        githubApp.repo, githubAccount.github.token, heroku.options.userAgent);
    }
  })
};
