# VoxPelli Tweet Streamer

A library for Twitters realtime streaming API that among other things has support for updating a stream on the fly without losing any tweets along the way and special support for tracking tweets from users in a way similar to Twitter lists by filtering away non-related tweets.

It's a work in progress - feel free to fork away but don't expect anything :)

**OAuth**-credentials: To get them register a Twitter app on https://dev.twitter.com/apps and when you've done so you can get a token for yourself from the configuration page.

## Usage

Simple:

```javascript
require('vptweetstream')
  .stream({
    consumer_key: 'abc123',
    consumer_secret: 'abc123',
    token: 'abc123',
    token_secret: 'abc123'
  }, { track : ['keyword1'] })
  .events.on('tweet', function (tweet) {
    // The full tweet object from Twitter
  });
```

Advanced:

```javascript
var vptweetstream = require('vptweetstream'), stream;

stream = vptweetstream.stream({
    consumer_key: 'abc123',
    consumer_secret: 'abc123',
    token: 'abc123',
    token_secret: 'abc123'
}, {
  follow : ['voxpelli', 'github'],    // tweets related to @voxpelli or @github
  track : ['keyword1', 'keyword2'],   // keyword1 OR keyword2
  locations : [
    ['-122.75,36.8', '-121.75,37.8'], // San Fransisco
    ['-74,40', '-73,41']              // OR New York
  ],
  realfollow : true // Only show tweets from someone in the follow array
});

stream.events.on('tweet', function (tweet) {
  // The full tweet object from Twitter
});

stream.events.on('skip count', function (count) {
  // Twitter skipped some tweets due to high volume, this is the amount skipped
});

// Change what is tracked on the fly
// The stream will change to track just "apple" as soon as possible
stream.changeStream({ track : ['apple'] });
```

## Advanced options

* **follow** - an array of Twitter usernames to follow. Any tweet related to one of these users will be included in the stream, see [Twitter's documentation](https://dev.twitter.com/docs/streaming-apis/parameters#follow) for which kind of tweets that are included.
* **track** - an array of keywords to track. If a tweet includes the keyword in any variation it will be included in the stream, see [Twitter's documentation](https://dev.twitter.com/docs/streaming-apis/parameters#track) for all variations.
* **locations** - either just a simple array containing the longitude and latitutude positions as two strings or an array containing several such arrays. Any tweet from within any of the specified bounding boxes will be included in the stream.
* **realfollow** - used with *follow* to simulate something like a Twitter list where only the tweets that's actually from the followed persons are included. Set to true to activate.

### Events

* **tweet** - triggered whenever a new tweet is received in the stream. A full tweet object is sent as the first argument, see [Twitter's documentation](https://dev.twitter.com/docs/platform-objects/tweets) for what such an object looks like.
* **skip count** - triggered when Twitter has skipped some tweets in its stream due to high volume. The amount of tweets skipped is sent as the first argument.

## Currently supported message types

Twitter's streaming API contains [many message types](https://dev.twitter.com/docs/streaming-apis/messages), these are the ones that are currently supported:

* limit
* tweets
* warning (barely supported, will emit custom warning to the console)
* delete (barely supported, will emit custom warning to the console)

Non-supported message types will result in warnings being written to the console.

## Possible future features

* **More message types**
* **More events**

## Changelog

### 0.3.4

* Added new closeStream() method to enable graceful shutdowns - which is useful at eg. Heroku

### 0.3.3

* Fixed bug with replacing old connections with new ones

### 0.3.2

* Made it possible to initiate the stream without starting it

### 0.3.1

* Removed unused modules that were still loaded

### 0.3.0

* Moved to OAuth for authentication due to changes in the Twitter API

### 0.2.1

* Corrected a faulty URL for the git-repository in the package.json

### 0.2.0

* No changelog being tracked for this and prior version, but main changes were related to updating the module to new Node, NPM and Twitter versions.
