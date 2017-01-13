const cli = require('heroku-cli-util');
const KOLKRABBI_BASE_URL = 'https://kolkrabbi.heroku.com';

function kolkrabbiRequest(url, token) {
  return cli.got.get(KOLKRABBI_BASE_URL + url, {
    headers: {
      authorization: 'Bearer ' + token
    },
    json: true
  }).then(res => res.body);
}

function getAccount(token) {
  return kolkrabbiRequest('/account/github/token', token);
}

module.exports.getAccount = getAccount;
