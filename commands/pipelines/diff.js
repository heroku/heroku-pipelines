'use strict';

let cli          = require('heroku-cli-util');
let disambiguate = require('../../lib/disambiguate');
let co           = require('co');
var bluebird     = require('bluebird');
var request      = bluebird.promisify(require('request'));

const PROMOTION_ORDER = ['development', 'staging', 'production'];
const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

module.exports = {
  topic: 'pipelines',
  command: 'diff',
  description: 'TODO',
  help: 'TODO',
  needsAuth: true,
  needsApp: true,
  run: cli.command(function* (context, heroku) {

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

    // TODO: Move something else.
    function *getLatestCommitHash(appId) {
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
      return slug.commit;
    }

    const app = context.app;

    const coupling = yield cli.action(`Fetching app info`, heroku.request({
      method: 'GET',
      path: `/apps/${app}/pipeline-couplings`,
      headers: { 'Accept': PIPELINES_HEADER }
    }));

    const allApps = yield cli.action(`Fetching apps from ${coupling.pipeline.name}`,
      heroku.request({
        method: 'GET',
        path: `/pipelines/${coupling.pipeline.id}/apps`,
        headers: { 'Accept': PIPELINES_HEADER }
      }));

    const sourceStage = coupling.stage;
    const targetStage = PROMOTION_ORDER[PROMOTION_ORDER.indexOf(sourceStage) + 1];

    if (targetStage === null || PROMOTION_ORDER.indexOf(sourceStage) < 0) {
      throw new Error(`Unable to diff ${app}`);
    }

    const downstreamApps = allApps.filter(function(app) {
      return app.coupling.stage === targetStage;
    });

    if (downstreamApps.length < 1) {
      throw new Error(`Cannot diff ${app} as there are no downstream apps configured`);
    }
    // TODO: What if downstreamApps.length > 1?

    const wrappedGetLatestCommitHash = co.wrap(getLatestCommitHash);
    const hashes = yield cli.action(`Fetching commit data`, bluebird.all([
      wrappedGetLatestCommitHash(downstreamApps[0].id),
      wrappedGetLatestCommitHash(app)
    ]));

    if (hashes[0] === hashes[1]) {
      console.log(`everything is up to date`);
      return;
    }

    const githubAccount = yield kolkrabbiRequest(
      `https://kolkrabbi.heroku.com/account/github/token`, heroku.options.token);
    const githubApp = yield kolkrabbiRequest(
      `https://kolkrabbi.heroku.com/apps/${coupling.app.id}/github`, heroku.options.token);

    const diff = yield cli.action(`Fetching diff from GitHub`, request({
      url: `https://api.github.com/repos/${githubApp.repo}/compare/${hashes[0]}...${hashes[1]}`,
      headers: {
        authorization: 'token ' + githubAccount.github.token,
        'user-agent': heroku.options.userAgent,
      },
      json: true
    }).get(1));

    console.log(`\n${app} is ahead by ${diff.ahead_by} commit${diff.ahead_by === 1 ? '' : 's'}`);
    for (let i = 0; i < diff.commits.length; i++) {
      let commit = diff.commits[i];
      let abbreviatedHash = commit.sha.substring(0, 8);
      let authoredDate = commit.commit.author.date;
      let authorName = commit.commit.author.name;
      let message = commit.commit.message;
      console.log(`  ${abbreviatedHash}  ${authoredDate}  ${message} (${authorName})`);
    }

  })
};
