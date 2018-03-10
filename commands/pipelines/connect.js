const cli = require('heroku-cli-util')
const co = require('co')
const api = require('../../lib/api')
const KolkrabbiAPI = require('../../lib/kolkrabbi-api')
const GitHubAPI = require('../../lib/github-api')

const {flags} = require('cli-engine-heroku')

const Validate = require('./setup/validate')
const getGitHubToken = require('./setup/getGitHubToken')
const getNameAndRepo = require('./setup/getNameAndRepo')
const getRepo = require('./setup/getRepo')
const getSettings = require('./setup/getSettings')
const getCISettings = require('./setup/getCISettings')
const setupPipeline = require('./setup/setupPipeline')
const createApps = require('./setup/createApps')
const pollAppSetups = require('./setup/pollAppSetups')

module.exports = {
  topic: 'pipelines',
  command: 'connect',
  description: 'connect a github repo to an existing pipeline',

  help: `Example:

    $ heroku pipelines:connect example githuborg/reponame
    Configuring pipeline... done
    View your new pipeline by running \`heroku pipelines:open e5a55ffa-de3f-11e6-a245-3c15c2e6bc1e\``,
  needsApp: false,
  needsAuth: true,
  wantsOrg: true,
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
    flags.team({name: 'team', hasValue: true, description: 'the team which will own the apps (can also use --org)'}),
  ],
  run: cli.command(co.wrap(function* (context, heroku) {
    const errors = Validate.nameAndRepo(context.args)

    if (errors.length) {
      cli.error(errors.join(', '))
      return
    }

    const kolkrabbi = new KolkrabbiAPI(context.version, heroku.options.token)
    const github = new GitHubAPI(context.version, yield getGitHubToken(kolkrabbi))

    const organization = context.org || context.team || context.flags.team || context.flags.organization
    const {name: pipelineName, repo: repoName} = yield getNameAndRepo(context.args)
    const stagingAppName = pipelineName + Validate.STAGING_APP_INDICATOR
    const repo = yield getRepo(github, repoName)

    let ownerType = organization ? 'team' : 'user'

    // If team or org is not specified, we assign ownership to the user creating
    let owner = organization ? yield api.getTeam(heroku, organization) : yield api.getAccountInfo(heroku)
    let ownerID = owner.id

    owner = { id: ownerID, type: ownerType }

    const pipeline = yield cli.action(
      'Getting pipeline ID',
      api.findPipelineByName(heroku, pipelineName)
    )

    yield cli.action(
      'Linking to repo',
      // not sure why a collection of pipelines comes back
      // grabbing the first
      kolkrabbi.createPipelineRepository(pipeline[0].id, repo.id)
    )

  }))
}
