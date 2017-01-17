const cli = require('heroku-cli-util')
const GITHUB_API = 'https://api.github.com'

function request (url, token, options = {}) {
  options = Object.assign({
    headers: {
      Authorization: `Token ${token}`
    },
    json: true
  }, options)

  return cli.got.get(`${GITHUB_API}${url}`, options)
}

function getRepo (token, name) {
  return request(`/repos/${name}`, token).then((res) => res.body)
}

function getArchiveURL (token, repo, ref) {
  return request(`/repos/${repo}/tarball/${ref}`, token, {
    followRedirect: false
  }).then((res) => res.headers.location)
}

module.exports.getRepo = getRepo
module.exports.getArchiveURL = getArchiveURL
