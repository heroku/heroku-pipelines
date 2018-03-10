const cli = require('heroku-cli-util')
const co = require('co')
const api = require('../../lib/api')
const KolkrabbiAPI = require('../../lib/kolkrabbi-api')

const {
  flags
} = require('cli-engine-heroku')

module.exports = {
  topic: 'pipelines',
  command: 'reviewapps',
  description: 'setup review apps',

  help: `Example:

    $ heroku pipelines:reviewapps mypipeline --app myapp --enable --autodeploy --autodestroy
    Enabling review apps ...
    Enabling auto deployment ...
    Enabling auto destroy ...
    Configuring pipeline... done`,
  needsApp: false,
  needsAuth: true,
  wantsOrg: false,
  args: [{
    name: 'name',
    description: 'name of pipeline',
    optional: true
  }],
  flags: [
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
      name: 'app',
      char: 'a',
      description: 'default app for review apps',
      hasValue: true,
      required: true
    },
    {
      name: 'autodeploy',
      char: 'p',
      description: 'autodeploy the review app',
      hasValue: false
    },
    {
      name: 'autodestroy',
      char: 'u',
      description: 'autodestroy the review app',
      hasValue: false
    }
  ],
  run: cli.command(co.wrap(function* (context, heroku) {

    // ensure the user is either enabling or disabling
    if (!context.flags.enable && !context.flags.disable) {
      cli.warn(`You must chose to either enable or disable review apps for ${cli.color.red(context.args.name)}. Aborted.`)
      return
    }

    // ensure the users isn't doing both
    if (context.flags.enable && context.flags.disable) {
      cli.warn(`You must chose to either enable or disable review apps for ${cli.color.red(context.args.name)}. Aborted.`)
      return
    }

    // ensure user not passying autodeploy when disabling
    if (context.flags.disable && context.flags.autodeploy)  {
      cli.warn(`You cannot set autodeploy when disabling review apps.`)
      return
    }

    // ensure user not passying autodeploy when disabling
    if (context.flags.disable && context.flags.autodestroy)  {
      cli.warn(`You cannot set autodestroy when disabling review apps.`)
      return
    }

    const kolkrabbi = new KolkrabbiAPI(context.version, heroku.options.token)

    const settings = {
      pull_requests: {
        enabled: false,
        auto_deploy: false,
        auto_destroy: false
      }
    }

    if (context.flags.enable) {
      cli.log('Enabling review apps ...');
      settings.pull_requests.enabled = true

      if (!context.flags.autodeploy && !context.flags.autodestroy) {
        cli.log('Using default settings ...');
      } else {
        if (context.flags.autodeploy) {
          cli.log('Enabling auto deployment ...');
          settings.pull_requests.auto_deploy = true;
        }
        if (context.flags.autodestroy) {
          cli.log('Enabling auto destroy ...');
          settings.pull_requests.auto_destroy = true;
        }
      }
    }

    if (context.flags.disable) {
      cli.log('Disabling review apps ...');
    }

    let app = yield api.getApp(heroku, context.flags.app)

    yield cli.action(
      'Configuring pipeline',
      kolkrabbi.updateAppLink(app.id, settings)
    )

  }))
}