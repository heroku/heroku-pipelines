'use strict';

let cli = require('heroku-cli-util');

const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

function getCoupling(heroku, app) {
  return heroku.request({
    method: 'GET',
    path: `/apps/${app}/pipeline-couplings`,
    headers: { 'Accept': PIPELINES_HEADER }
  });
}

function patchCoupling(heroku, coupling, stage) {
  return heroku.request({
    method: 'PATCH',
    path: `/pipeline-couplings/${coupling.id}`,
    body: {stage: stage},
    headers: { 'Accept': PIPELINES_HEADER }
  });
}

function updateCoupling(heroku, app, stage) {
  return getCoupling(heroku, app)
           .then(coupling => patchCoupling(heroku, coupling, stage));
}

module.exports = {
  topic: 'pipelines',
  command: 'update',
  description: 'update this app\'s stage in a pipeline',
  help: 'Update this app\'s stage in a pipeline.\n\n  Example:\n$ heroku pipelines:update -s staging -a example-admin\n  Changing example-admin to staging... done',
  needsApp: true,
  needsAuth: true,
  flags: [
    {name: 'stage', char: 's', description: 'new stage of app', hasValue: true}
  ],
  run: cli.command(function* (context, heroku) {
    if(!context.flags.stage) {
      cli.error('Stage must be specified with -s');
      process.exit(1);
    }

    const app   = context.app;
    const stage = context.flags.stage;

    yield cli.action(`Changing ${app} to ${stage}`,
                     updateCoupling(heroku, app, stage));
  })
};
