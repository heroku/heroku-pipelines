const api = require('../../../lib/api')

function* hasCIFlag (heroku) {
  let hasFlag
  try {
    hasFlag = (yield api.getAccountFeature(heroku, 'ci')).enabled
  } catch (error) {
    hasFlag = false
  }
  return hasFlag
}

module.exports = hasCIFlag
