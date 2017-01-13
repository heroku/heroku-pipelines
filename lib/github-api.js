const got = require('got');
const GITHUB_API = 'https://api.github.com';

function request(url, token) {
  return got.get(`${GITHUB_API}${url}`, {
    headers: {
      Authorization: `Token ${token}`
    }
  });
}

function getRepo(name, token) {
  return request(`/repos/${name}`, token);
}

module.exports.getRepo = getRepo;
