'use strict';

const cli = require('heroku-cli-util');
const co  = require('co');
const api = require('../../lib/api');
const kolkrabbi = require('../../lib/kolkrabbi-api');
const github = require('../../lib/github-api');
const prompt = require('../../lib/prompt');

function* getPipelineName(context) {
  return context.args.name || (yield prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Pipeline name'
    }
  ])).name;
}

function* getRepoName(context) {
  return context.args.repo || (yield prompt([
    {
      type: 'input',
      name: 'repo',
      message: 'GitHub repository to connect to (e.g. rails/rails)'
    }
  ])).repo;
}

function* getGithubAccount(token) {
  let githubAccount;

  try {
    githubAccount = yield kolkrabbi.getAccount(token);
  } catch(error) {
    // TODO: Allow user to conect here
    throw new Error('Account not connected to GitHub.');
  }
  return githubAccount;
}

function* getRepo(name, token) {
  let repo;

  try {
    repo = yield github.getRepo(name, token);
  } catch(error) {
    throw new Error(`Could not access ${name}`);
  }

  return repo;
}

function createApp(heroku, archiveURL, name, pipeline, stage) {
  return api.createAppSetup(heroku, {
    source_blob: { url: archiveURL },
    app: { name }
  }).then((setup) => {
    return api.postCoupling(heroku, pipeline.id, setup.app.id, stage).then(() => {
      return setup.app;
    });
  });
}

function* getSettings(branch) {
  return yield prompt([{
    type: 'confirm',
    name: 'auto_deploy',
    message: `Automatically deploy the ${branch} branch to staging?`
  }, {
    type: 'confirm',
    name: 'wait_for_ci',
    message: `Wait for CI to pass before deploying the ${branch} branch to staging?`,
    when(answers) { return answers.auto_deploy; }
  }, {
    type: 'confirm',
    name: 'pull_requests.enabled',
    message: 'Enable review apps?'
  }, {
    type: 'confirm',
    name: 'pull_requests.auto_deploy',
    message: 'Automatically create review apps for every PR?',
    when(answers) { return answers.pull_requests.enabled; }
  }, {
    type: 'confirm',
    name: 'pull_requests.auto_destroy',
    message: 'Automatically destroy idle review apps after 5 days?',
    when(answers) { return answers.pull_requests.enabled; }
  }]);
}

function setupPipeline(token, app, settings) {
  return kolkrabbi.updateAppLink(token, app, settings).then((appLink) => {
    return appLink;
  }, (error) => {
    cli.error(error.response.body.message);
  });
}

module.exports = {
  topic: 'pipelines',
  command: 'setup',
  description: 'bootstrap a new pipeline with common settings',
  help: 'create a new pipeline and set up common features such as review apps',
  needsApp: false,
  needsAuth: true,
  args: [
    {
      name: 'name',
      description: 'name of pipeline',
      optional: true
    },
    {
      name: 'repo',
      description: 'a GitHub repository to connect the pipeline to',
      optional: true
    }
  ],
  run: cli.command(co.wrap(function*(context, heroku) {
    //TODO: Allow -o flag
    const pipelineName  = yield getPipelineName(context);
    const repoName      = yield getRepoName(context);
    const githubAccount = yield getGithubAccount(heroku.options.token);
    const githubToken   = githubAccount.github.token;
    const repo          = yield getRepo(githubToken, repoName);

    const pipeline     = yield cli.action('Creating pipeline', api.createPipeline(heroku, pipelineName));
    yield cli.action('Linking to repo', kolkrabbi.createPipelineRepository(heroku.options.token, pipeline.id, repo.id));
    const archiveURL   = yield github.getArchiveURL(githubToken, repoName, repo.default_branch);

    yield cli.action('Creating production app', createApp(heroku, archiveURL, pipelineName, pipeline, 'production'));
    const stagingApp    = yield cli.action('Creating staging app', createApp(heroku, archiveURL, `${pipelineName}-staging`, pipeline, 'staging'));

    const settings = yield getSettings(repo.default_branch);
    yield cli.action('Configuring pipeline', setupPipeline(heroku.options.token, stagingApp.id, settings));

    // TODO: enable CI

    yield cli.open(`https://dashboard.heroku.com/pipelines/${pipeline.id}`);
  }))
};
