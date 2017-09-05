const cli = require('heroku-cli-util')
const co = require('co')
const api = require('../../lib/api')
const KolkrabbiAPI = require('../../lib/kolkrabbi-api')
const GitHubAPI = require('../../lib/github-api')
const prompt = require('../../lib/prompt')

const REPO_REGEX = /.+\/.+/
const STAGING_APP_INDICATOR = '-staging'
const PIPELINE_MIN_LENGTH = 2
const PIPELINE_MAX_LENGTH = 30 - STAGING_APP_INDICATOR.length
const ERR_PIPELINE_NAME_LENGTH = `Please choose a pipeline name between 2 and ${PIPELINE_MAX_LENGTH} characters long`
const ERR_REPO_FORMAT = 'Repository name must be in the format organization/repo'

const DEFAULT_SETTINGS = {
  auto_deploy: true,
  wait_for_ci: true,
  pull_requests: {
    enabled: true,
    auto_deploy: true,
    auto_destroy: true
  }
}

function validate ({ name, repo }) {
  const errors = []
  const [nameIsValid, nameMsg] = validateName(name || '')
  const [repoIsValid, repoMsg] = validateRepo(repo || '')

  if (name && !nameIsValid) errors.push(nameMsg)
  if (repo && !repoIsValid) errors.push(repoMsg)

  return errors
}

function validateName (name) {
  const isValid = name.length >= PIPELINE_MIN_LENGTH &&
                  name.length <= PIPELINE_MAX_LENGTH
  return isValid ? [isValid] : [isValid, ERR_PIPELINE_NAME_LENGTH]
}

function validateRepo (repo) {
  const isValid = !!repo.match(REPO_REGEX)
  return isValid ? [isValid] : [isValid, ERR_REPO_FORMAT]
}

function getGitHubToken (kolkrabbi) {
  return kolkrabbi.getAccount().then((account) => {
    return account.github.token
  }, () => {
    throw new Error('Account not connected to GitHub.')
  })
}

function getRepo (github, name) {
  return github.getRepo(name).catch(() => {
    throw new Error(`Could not access the ${name} repo`)
  })
}

function createApp (heroku, { archiveURL, name, organization, pipeline, stage }) {
  const params = {
    source_blob: { url: archiveURL },
    app: { name },
    pipeline_coupling: {
      stage,
      pipeline: pipeline.id
    }
  }

  if (organization) {
    params.app.organization = organization
  } else {
    params.app.personal = true
  }

  return api.createAppSetup(heroku, params).then((setup) => setup.app)
}

function* getNameAndRepo (args) {
  const answer = yield prompt([{
    type: 'input',
    name: 'name',
    message: 'Pipeline name',
    when () { return !args.name },
    validate (input) {
      const [valid, msg] = validateName(input)
      return valid || msg
    }
  }, {
    type: 'input',
    name: 'repo',
    message: 'GitHub repository to connect to (e.g. rails/rails)',
    when () { return !args.repo },
    validate (input) {
      const [valid, msg] = validateRepo(input)
      return valid || msg
    }
  }])

  const reply = Object.assign(answer, args)
  reply.name = reply.name.toLowerCase().replace(/\s/g, '-')

  return reply
}

function* getSettings (yes, branch) {
  if (yes) {
    return DEFAULT_SETTINGS
  }

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

function* hasCIFlag (heroku) {
  let hasFlag
  try {
    hasFlag = (yield api.getAccountFeature(heroku, 'ci')).enabled
  } catch (error) {
    hasFlag = false
  }
  return hasFlag
}

function* getCISettings (yes, organization) {
  const settings = yes ? { ci: true } : yield prompt([{
    type: 'confirm',
    name: 'ci',
    message: 'Enable automatic Heroku CI test runs?'
  }])

  if (settings.ci && organization) {
    settings.organization = organization
  }

  return settings
}

function setupPipeline (kolkrabbi, app, settings, pipelineID, ciSettings = {}) {
  const promises = [kolkrabbi.updateAppLink(app, settings)]

  if (ciSettings.ci) {
    promises.push(
      kolkrabbi.updatePipelineRepository(pipelineID, ciSettings)
    )
  }

  return Promise.all(promises).then(([appLink]) => {
    return appLink
  }, (error) => {
    cli.error(error.response.body.message)
  })
}

module.exports = {
  topic: 'pipelines',
  command: 'setup',
  description: 'bootstrap a new pipeline with common settings and create a production and staging app (requires a fully formed app.json in the repo)',
  help: `Example:

  heroku pipelines:setup example githuborg/reponame -o example-org
  ? Automatically deploy the master branch to staging? Yes
  ? Wait for CI to pass before deploying the master branch to staging? Yes
  ? Enable review apps? Yes
  ? Automatically create review apps for every PR? Yes
  ? Automatically destroy idle review apps after 5 days? Yes
  Creating pipeline... done
  Linking to repo... done
  Creating ⬢ example (production app)... done
  Creating ⬢ example-staging (staging app)... done
  Configuring pipeline... done
  View your new pipeline by running \`heroku pipelines:open e5a55ffa-de3f-11e6-a245-3c15c2e6bc1e\``,
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
      name: 'organization',
      char: 'o',
      description: 'the organization which will own the apps (can also use --team)',
      hasValue: true
    },
    {
      name: 'team',
      char: 't',
      description: 'the team which will own the apps (can also use --organization)',
      hasValue: true
    },
    {
      name: 'yes',
      char: 'y',
      description: 'accept all default settings without prompting',
      hasValue: false
    }
  ],
  run: cli.command(co.wrap(function*(context, heroku) {
    const errors = validate(context.args)

    if (errors.length) {
      cli.error(errors.join(', '))
      return
    }

    const kolkrabbi = new KolkrabbiAPI(context.version, heroku.options.token)
    const github = new GitHubAPI(context.version, yield getGitHubToken(kolkrabbi))

    const organization = context.flags.organization || context.flags.team
    const { name: pipelineName, repo: repoName } = yield getNameAndRepo(context.args)
    const stagingAppName = pipelineName + STAGING_APP_INDICATOR
    const repo = yield getRepo(github, repoName)
    const settings = yield getSettings(context.flags.yes, repo.default_branch)

    let ciSettings
    if (yield hasCIFlag(heroku)) {
      ciSettings = yield getCISettings(context.flags.yes, organization)
    }

    const pipeline = yield cli.action(
      'Creating pipeline',
      api.createPipeline(heroku, pipelineName)
    )

    yield cli.action(
      'Linking to repo',
      kolkrabbi.createPipelineRepository(pipeline.id, repo.id)
    )

    const archiveURL = yield github.getArchiveURL(repoName, repo.default_branch)

    yield cli.action(
      `Creating ${cli.color.app(pipelineName)} (production app)`,
      createApp(heroku, {
        archiveURL,
        pipeline,
        name: pipelineName,
        stage: 'production',
        organization
      })
    )

    const stagingApp = yield cli.action(
      `Creating ${cli.color.app(stagingAppName)} (staging app)`,
      createApp(heroku, {
        archiveURL,
        pipeline,
        name: stagingAppName,
        stage: 'staging',
        organization
      })
    )

    yield cli.action(
      'Configuring pipeline',
      setupPipeline(kolkrabbi, stagingApp.id, settings, pipeline.id, ciSettings)
    )

    yield cli.open(`https://dashboard.heroku.com/pipelines/${pipeline.id}`)
  }))
}
