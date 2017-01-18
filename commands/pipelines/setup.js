const cli = require('heroku-cli-util')
const co = require('co')
const api = require('../../lib/api')
const kolkrabbi = require('../../lib/kolkrabbi-api')
const github = require('../../lib/github-api')
const prompt = require('../../lib/prompt')
const REPO_REGEX = /.+\/.+/

function getGitHubToken (token) {
  return kolkrabbi.getAccount(token).then((account) => {
    return account.github.token
  }, () => {
    throw new Error('Account not connected to GitHub.')
  })
}

function getRepo (token, name) {
  return github.getRepo(token, name).catch(() => {
    throw new Error(`Could not access the ${name} repo`)
  })
}

function createApp (heroku, archiveURL, name, pipeline, stage) {
  return api.createAppSetup(heroku, {
    source_blob: { url: archiveURL },
    app: { name }
  }).then((setup) => {
    return api.postCoupling(heroku, pipeline.id, setup.app.id, stage).then(() => {
      return setup.app
    })
  })
}

function* getNameAndRepo (args) {
  const answers = yield prompt([{
    type: 'input',
    name: 'name',
    message: 'Pipeline name',
    when () { return !args.name }
  }, {
    type: 'input',
    name: 'repo',
    message: 'GitHub repository to connect to (e.g. rails/rails)',
    when () { return !args.repo },
    validate (input) {
      if (input.match(REPO_REGEX)) return true
      return 'Must be in the format organization/rep  o'
    }
  }])

  return Object.assign(answers, args)
}

function* getSettings (branch) {
  return yield prompt([{
    type: 'confirm',
    name: 'auto_deploy',
    message: `Automatically deploy the ${branch} branch to staging?`
  }, {
    type: 'confirm',
    name: 'wait_for_ci',
    message: `Wait for CI to pass before deploying the ${branch} branch to staging?`,
    when (answers) { return answers.auto_deploy }
  }, {
    type: 'confirm',
    name: 'pull_requests.enabled',
    message: 'Enable review apps?'
  }, {
    type: 'confirm',
    name: 'pull_requests.auto_deploy',
    message: 'Automatically create review apps for every PR?',
    when (answers) { return answers.pull_requests.enabled }
  }, {
    type: 'confirm',
    name: 'pull_requests.auto_destroy',
    message: 'Automatically destroy idle review apps after 5 days?',
    when (answers) { return answers.pull_requests.enabled }
  }])
}

function setupPipeline (token, app, settings) {
  return kolkrabbi.updateAppLink(token, app, settings).then((appLink) => {
    return appLink
  }, (error) => {
    cli.error(error.response.body.message)
  })
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
    // TODO:
    //   - Allow -o flag
    //   - Enable CI
    //
    const herokuToken = heroku.options.token
    const githubToken = yield getGitHubToken(herokuToken)

    const { name: pipelineName, repo: repoName } = yield getNameAndRepo(context.args)
    const repo = yield getRepo(githubToken, repoName)
    const settings = yield getSettings(repo.default_branch)

    const pipeline = yield cli.action(
      'Creating pipeline',
      api.createPipeline(heroku, pipelineName)
    )

    yield cli.action(
      'Linking to repo',
      kolkrabbi.createPipelineRepository(herokuToken, pipeline.id, repo.id)
    )

    const archiveURL = yield github.getArchiveURL(githubToken, repoName, repo.default_branch)

    yield cli.action(
      `Creating ${cli.color.app(pipelineName)} (production app)`,
      createApp(heroku, archiveURL, pipelineName, pipeline, 'production')
    )

    const stagingAppName = `${pipelineName}-staging`
    const stagingApp = yield cli.action(
      `Creating ${cli.color.app(stagingAppName)} (staging app)`,
      createApp(heroku, archiveURL, stagingAppName, pipeline, 'staging')
    )

    yield cli.action(
      'Configuring pipeline',
      setupPipeline(herokuToken, stagingApp.id, settings)
    )

    cli.log(`View your new pipeline by running \`heroku pipelines:open ${pipeline.id}\``)
  }))
}
