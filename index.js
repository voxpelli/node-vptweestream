var http = require('http'),
  base64 = require('base64'),
  qs     = require('querystring'),
  events = require('events');

function stream(username, password, stream) {
  var currentClient, newClient, twitterEvents, // Vars
    changeStream, parseStreamUpdate, handleStream; // Functions

  changeStream = function(stream) {
    var client, query, count, requestStart = (new Date()).getTime();

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

      client.request('/1/statuses/' + query, {
        'Host'          : 'stream.twitter.com',
        'User-Agent'    : 'vptweetstream/0.1 (http://kodfabrik.se)',
        'Authorization' : 'Basic ' + base64.encode(username + ':' + password)
      }).on('response', function (response) {
        var request = this, closeOldConnection;
        closeOldConnection = function () {
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
            if (response.statusCode == 200) {
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
            retryIn = retryIn * ((requestStart - (new Date()).getTime() > 5000) ? 1 : 15);
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
      var tweet, bodies, i, length, created;
      body += chunk;
      console.log('Chunk');
      if (chunk.charCodeAt(chunk.length - 2) === 13 && chunk.charCodeAt(chunk.length - 1) === 10) {
        bodies = body.split("\r");
        body   = '';
        length = bodies.length - 1;
        for (i = 0; i < length; i += 1) {
          console.log('Tweet');
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

exports.stream = stream;

// Utility functions

function processStream(stream) {
  var i, length, hashRegExp;
  // Create regular expression to be used to match results if we are picky about follows
  if (stream.realfollow && !stream.trackRegExp) {
    hashRegExp = [];
    length = stream.track.length;
    for (i = 0; i < length; i++) {
      hashRegExp[i] = escapeRegExp(stream.track[i]);
    }
    console.log('Twitter Tracking RegExp: (' + hashRegExp.join(')|(') + ')');
    stream.trackRegExp = '(' + hashRegExp.join(')|(') + ')';
  }
}

function validateTweet(tweet, stream) {
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
}

function escapeRegExp(text) {
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
}