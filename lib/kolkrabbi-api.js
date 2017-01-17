const cli = require('heroku-cli-util')
const KOLKRABBI_BASE_URL = 'https://kolkrabbi.heroku.com'

function kolkrabbiRequest (url, token, options = {}) {
  if (options.body) {
    options.body = JSON.stringify(options.body)
  }

  if (!options.headers) {
    options.headers = {}
  }

  options.headers.authorization = `Bearer ${token}`

  if (['POST', 'PATCH', 'DELETE'].includes(options.method)) {
    options.headers['Content-type'] = 'application/json'
  }

  options = Object.assign({ json: true }, options)

  return cli.got(KOLKRABBI_BASE_URL + url, options).then((res) => res.body)
}

function getAccount (token) {
  return kolkrabbiRequest('/account/github/token', token)
}

function createPipelineRepository (token, pipeline, repository) {
  return kolkrabbiRequest(`/pipelines/${pipeline}/repository`, token, {
    method: 'POST',
    body: { repository }
  })
}

function updateAppLink (token, app, body) {
  return kolkrabbiRequest(`/apps/${app}/github`, token, {
    method: 'PATCH',
    body
  })
}

module.exports.getAccount = getAccount
module.exports.createPipelineRepository = createPipelineRepository
module.exports.updateAppLink = updateAppLink
