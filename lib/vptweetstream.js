/*jslint white: true, onevar: true, undef: true, nomen: true, eqeqeq: true, plusplus: true, bitwise: true, regexp: true, newcap: true, immed: true, indent: 2 */
/*global require, process, console, setTimeout, exports */
var http = require('http'),
  qs     = require('querystring'),
  events = require('events'),
  createStream,
  processStream,
  validateTweet,
  escapeRegExp;

createStream = function (username, password, stream) {
  var currentClient, newClient, twitterEvents, // Vars
    changeStream, parseStreamUpdate, handleStream; // Functions

  changeStream = function (stream) {
    var client, query, requestStart = Date.now();

    if (typeof stream === 'object') {
      query = {};

      processStream(stream);

      if (stream.track && stream.track.length) {
        query.track = stream.track.join(',');
      }
      if (stream.follow && stream.follow.length) {
        query.follow = stream.follow.join(',');
      }
      if (query.track || query.follow) {
        query = 'filter.json?' + qs.stringify(query);
      }
      else {
        query = false;
      }
    }
    else {
      query = stream + '.json';
    }

    if (query) {
      client = http.createClient(80, 'stream.twitter.com');
      newClient = client;

      console.log('Requesting /1/statuses/' + query);
      client.request('/1/statuses/' + query, {
        'Host'          : 'stream.twitter.com',
        'User-Agent'    : 'vptweetstream/0.1 (http://kodfabrik.se)',
        'Authorization' : 'Basic ' + (new Buffer(username + ':' + password, 'utf8')).toString('base64')
      }).on('response', function (response) {
        var closeOldConnection = function () {
          if (client === newClient) {
            if (currentClient) {
              console.log('This is a new Twitter connection - closing the currently open.');
              currentClient.destroy();
            }
            currentClient = newClient;
          }
          else {
            console.log('This is an old Twitter connection - closing.');
            client.destroy();
          }
          response.removeListener('data', closeOldConnection);
        };
        response.setEncoding('utf8');
        response.on('data', handleStream(stream));
        response.on('data', closeOldConnection);
        response.on('end', function () {
          //TODO: Make better backing off?
          var retryIn;
          console.log('Twitter exited with code: ' + response.statusCode);
          if (client === newClient) {
            if (response.statusCode === 200) {
              retryIn = 1000;
            }
            else if (response.statusCode > 399 && response.statusCode < 500) {
              retryIn = 60000;
            }
            else if (response.statusCode > 499 && response.statusCode < 600) {
              //TODO: Twitter says they should be contacted if this happen - so log it carefully
              retryIn = 2000;
            }
            else {
              retryIn = 2000;
            }
            retryIn = retryIn * ((requestStart - Date.now() > 5000) ? 1 : 15);
            console.log('Reconnecting to Twitter in ' + (retryIn / 1000) + ' seconds...');
            setTimeout(function () {
              changeStream(stream);
            }, retryIn);
          }
          else {
            console.log('Twitter connection replaced by newer connection.');
          }
        });
      }).end();
    }
  };

  parseStreamUpdate = function (update, stream) {
    try {
      update = JSON.parse(update);
    } catch (e) {
      update = false;
    }
    if (update) {
      if (update['delete']) {
        //TODO
      }
      else if (update.limit) {
        //TODO
      }
      //TODO: Check that this actually is a tweet?
      else if (validateTweet(update, stream)) {
        twitterEvents.emit('tweet', update);
      }
    }
  };

  handleStream = function (stream) {
    var body = '';
    return function (chunk) {
      var bodies, i, length;
      body += chunk;
      if (chunk.charCodeAt(chunk.length - 2) === 13 && chunk.charCodeAt(chunk.length - 1) === 10) {
        bodies = body.split("\r");
        body   = '';
        length = bodies.length - 1;
        for (i = 0; i < length; i += 1) {
          process.nextTick((function (body) {
            return function () {
              parseStreamUpdate(body, stream);
            };
          }(bodies[i])));
        }
      }
    };
  };

  twitterEvents = new events.EventEmitter();

  changeStream(stream);

  return {
    events : twitterEvents,
    changeStream : changeStream
  };
};

exports.stream = createStream;

// Utility functions

processStream = function (stream) {
  var i, length, hashRegExp;
  // Create regular expression to be used to match results if we are picky about follows
  if (stream.realfollow && !stream.trackRegExp) {
    hashRegExp = [];
    length = stream.track.length;
    for (i = 0; i < length; i += 1) {
      hashRegExp[i] = escapeRegExp(stream.track[i]);
    }
    console.log('Twitter Tracking RegExp: (' + hashRegExp.join(')|(') + ')');
    stream.trackRegExp = '(' + hashRegExp.join(')|(') + ')';
  }
};

validateTweet = function (tweet, stream) {
  if (stream.realfollow) {
    if (stream.follow && stream.follow.indexOf(tweet.user.id) !== -1 && (!tweet.in_reply_to_user_id || stream.follow.indexOf(tweet.in_reply_to_user_id) !== -1)) {
      return true;
    }
    // Creating a new RegExp here because when reusing an old RegExp currently made some checks fail when they shouldn't
    if (stream.trackRegExp && (!tweet.retweeted_status && (new RegExp(stream.trackRegExp, 'gi')).test(tweet.text))) {
      return true;
    }
    return false;
  }
  return true;
};

escapeRegExp = function (text) {
  if (!arguments.callee.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    arguments.callee.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')', 'g'
    );
  }
  return text.replace(arguments.callee.sRE, '\\$1');
};