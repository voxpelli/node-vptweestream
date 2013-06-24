/*jslint node: true, indent: 2 */

"use strict";

var request = require('request'),
  events = require('events'),
  version = require('../package.json').version,
  createStream,
  processStream,
  validateTweet,
  escapeRegExp;

createStream = function (oauth, stream) {
  var currentRequest, newRequest, twitterEvents, // Vars
    changeStream, parseStreamUpdate, handleStream; // Functions

  changeStream = function (stream) {
    var theRequest, path, method, query, i, length, requestStart = Date.now();

    if (stream === false) {
      return;
    }

    if (typeof stream === 'object') {
      query = {};

      processStream(stream);

      if (stream.track && stream.track.length) {
        query.track = stream.track.join(',');
      }
      if (stream.follow && stream.follow.length) {
        query.follow = stream.follow.join(',');
      }
      if (stream.locations && stream.locations.length) {
        if (typeof stream.locations[0] !== 'object') {
          stream.locations = [stream.locations];
        }
        query.locations = [];
        for (i = 0, length = stream.locations.length; i < length; i += 1) {
          query.locations.push(stream.locations[i].join(','));
        }
        query.locations = query.locations.join(',');
      }
      if (query.track || query.follow || query.locations) {
        path = 'filter.json';
        method = 'POST';
        query.stall_warnings = true;
      }
    } else {
      path = stream + '.json';
    }

    if (path) {
      console.log('Requesting /1/statuses/' + path + ' with query params:', query);
      theRequest = newRequest = request({
        url : 'https://stream.twitter.com/1.1/statuses/' + path,
        qs : query,
        method : method || 'GET',
        oauth : oauth,
        headers : {
          'User-Agent' : 'vptweetstream/' + version + ' (http://kodfabrik.se)'
        }
      }).on('response', function (response) {
        var closeOldConnection = function () {
          if (theRequest === newRequest) {
            if (currentRequest) {
              console.log('This is a new Twitter connection - closing the currently open.');
              currentRequest.end();
              //TODO: Throw an event about the new stream now being in effect
            }
            currentRequest = newRequest;
          } else {
            console.log('This is an old Twitter connection - closing.');
            theRequest.end();
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
          if (theRequest === newRequest) {
            if (response.statusCode === 200) {
              retryIn = 1000;
            } else if (response.statusCode > 399 && response.statusCode < 500) {
              retryIn = 60000;
            } else if (response.statusCode > 499 && response.statusCode < 600) {
              //TODO: Twitter says they should be contacted if this happen - so log it carefully
              retryIn = 2000;
            } else {
              retryIn = 2000;
            }
            retryIn = retryIn * ((requestStart - Date.now() > 5000) ? 1 : 15);
            console.log('Reconnecting to Twitter in ' + (retryIn / 1000) + ' seconds...');
            setTimeout(function () {
              changeStream(stream);
            }, retryIn);
          } else {
            console.log('Twitter connection replaced by newer connection.');
          }
        });
      });
      theRequest.end();
    }
  };

  parseStreamUpdate = function (update, stream) {
    try {
      update = JSON.parse(update);
    } catch (e) {
      update = false;
    }
    if (update) {
      if (update.warning) {
        if (update.warning.code === 'FALLING_BEHIND') {
          //TODO: Do something more? Call a callback instead?
          console.warn('Twitter warning: ' + update.warning.message);
        } else {
          console.warn('Twitter warning: ' + update.warning.message);
        }
      } else if (update['delete']) {
        //TODO Support
        console.warn('Unhandled delete event');
      } else if (update.limit) {
        twitterEvents.emit('skip count', update.limit.track);
      } else if (update.id_str && validateTweet(update, stream)) {
        //TODO: Check that this actually is a tweet?
        twitterEvents.emit('tweet', update);
      } else if (update.disconnect && update.disconnect.code === 7) {
        console.log('A newer connection closed an old one');
      } else {
        console.warn('Unhandled event:', update);
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
  if (!escapeRegExp.sRE) {
    var specials = [
      '/', '.', '*', '+', '?', '|',
      '(', ')', '[', ']', '{', '}', '\\'
    ];
    escapeRegExp.sRE = new RegExp(
      '(\\' + specials.join('|\\') + ')',
      'g'
    );
  }
  return text.replace(escapeRegExp.sRE, '\\$1');
};
