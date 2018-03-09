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
  command: 'reviewapps',
  description: 'setup review apps',

  help: `Example:

    $ heroku pipelines:setup example githuborg/reponame -o example-org
    ? Automatically deploy the master branch to staging? Yes
    ? Wait for CI to pass before deploying the master branch to staging? Yes
    ? Enable review apps? Yes
    ? Automatically create review apps for every PR? Yes
    ? Automatically destroy idle review apps after 5 days? Yes
    ? Enable automatic Heroku CI test runs? Yes
    Creating pipeline... done
    Linking to repo... done
    Creating production and staging apps (⬢ example and ⬢ example-staging)
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
    }
  ],
  flags: [
    flags.team({name: 'team', hasValue: true, description: 'the team which will own the apps (can also use --org)'}),
    {
      name: 'enable',
      char: 'e',
      description: 'enable',
      hasValue: false
    },
    {
      name: 'disable',
      char: 'd',
      description: 'disable',
      hasValue: false
    },
    {
      name: 'yes',
      char: 'y',
      description: 'accept all default settings without prompting',
      hasValue: false
    },
    {
      name: 'app',
      char: 'a',
      description: 'default app for review apps',
      hasValue: true,
      required: true
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

    const organization = context.org || context.team || context.flags.team || context.flags.organization
    const settings = yield getSettings(context.flags.yes, null)

    let ownerType = organization ? 'team' : 'user'

    // If team or org is not specified, we assign ownership to the user creating
    let owner = organization ? yield api.getTeam(heroku, organization) : yield api.getAccountInfo(heroku)
    let ownerID = owner.id

    owner = { id: ownerID, type: ownerType }

    let app = yield api.getApp(heroku, context.flags.app)

    yield cli.action(
      'Configuring pipeline',
      kolkrabbi.updateAppLink(app.id, settings)
    )


  }))
}
