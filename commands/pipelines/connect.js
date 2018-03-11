const cli = require('heroku-cli-util')
const co = require('co')
const api = require('../../lib/api')
const KolkrabbiAPI = require('../../lib/kolkrabbi-api')
const GitHubAPI = require('../../lib/github-api')

const Validate = require('./setup/validate')
const getGitHubToken = require('./setup/getGitHubToken')
const getNameAndRepo = require('./setup/getNameAndRepo')
const getRepo = require('./setup/getRepo')

module.exports = {
  topic: 'pipelines',
  command: 'connect',
  description: 'connect a github repo to an existing pipeline',

  help: `Example:

    $ heroku pipelines:connect example githuborg/reponame
    Configuring pipeline... done`,
  needsApp: false,
  needsAuth: true,
  wantsOrg: false,
  args: [{
      name: 'name',
      description: 'name of pipeline',
      optional: true
    },
    {
      name: 'repo',
      description: 'the GitHub repository to connect',
      optional: true
    }
  ],
  run: cli.command(co.wrap(function* (context, heroku) {
    const errors = Validate.nameAndRepo(context.args)

    if (errors.length) {
      cli.error(errors.join(', '))
      return
    }

    const kolkrabbi = new KolkrabbiAPI(context.version, heroku.options.token)
    const github = new GitHubAPI(context.version, yield getGitHubToken(kolkrabbi))
    const {
      name: pipelineName,
      repo: repoName
    } = yield getNameAndRepo(context.args)
    const repo = yield getRepo(github, repoName)

    const pipeline = yield cli.action(
      'Getting pipeline ID',
      api.getPipeline(heroku, pipelineName)
    )

    yield cli.action(
      'Linking to repo',
      kolkrabbi.createPipelineRepository(pipeline.id, repo.id)
    )

  }))
}