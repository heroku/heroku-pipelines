'use strict';

const cli = require('heroku-cli-util');
const co  = require('co');
const kolkrabbi = require('../../lib/kolkrabbi-api');
const github = require('../../lib/github-api');
const prompt = require('../../lib/prompt');

const createCoupling = require('../../lib/api').createCoupling;

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
  return githubAccount
}

function* getRepo(name, token) {
  let repo;

  try {
    repo = yield github.getRepo(name, token);
  } catch(error) {
    throw new Error(`Could not access ${repoName}`);
  }

  return repo;
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
  flags: [
    {
      name: 'stage',
      char: 's', description:
      'stage of first app in pipeline',
      hasValue: true
    }
  ],
  run: cli.command(co.wrap(function*(context, heroku) {
    const pipelineName  = yield getPipelineName(context);
    const repoName      = yield getRepoName(context);
    const githubAccount = yield getGithubAccount(heroku.options.token);
    const repo          = yield getRepo(repoName, githubAccount.github.token);

    // Create pipeline
    // Connect pipeline to GitHub
    // Create production app via /app-setups
    // Create staging app via /app-setups
    // Enable review apps
    // Enable CI auto runs if user is flagged in
    // Open dashboard on the new pipeline
  }))
};
