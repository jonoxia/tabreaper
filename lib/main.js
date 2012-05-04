const widgets = require("widget");
const tabs = require("tabs");
const timers = require("timers");
const namespace = require("api-utils/namespace");
const data = require("self").data;
const storage = require("simple-storage").storage;
const prefs = require('simple-prefs').prefs;

var {Cc, Ci, Cr} = require('chrome');
var tagssvc = Cc["@mozilla.org/browser/tagging-service;1"]
              .getService(Ci.nsITaggingService);

var bmsvc = Cc["@mozilla.org/browser/nav-bookmarks-service;1"]
  .getService(Ci.nsINavBookmarksService);

var ios = Cc["@mozilla.org/network/io-service;1"]
  .getService(Ci.nsIIOService);

const MIN_ACTIVE_TIME = 4000; // Looking at a tab for less time than this doesn't count as using it
const CHECK_INTERVAL = 30000; // How often to check for old tabs
const REAP_TAG = "tabreaper";

function getMaxTabAge() {
  // read the pref - it's specified in hours
  // This is a function rather than a constant so that if the user changes the pref
  // without restarting Firefox, the new max age will take effect on our next reaping check.
  return 20 * 1000;
  // return parseInt(prefs["tabreaper.max_tab_age"]) * 60 * 60 * 1000;
  // TODO should be another *60 (hours) but I'm doing minutes for debug purposes.
}

var underworldPage = data.url("ui/underworld.html");

var urlsToIgnore = [underworldPage, "about:blank"];

function unTag(url, deleteBookmark) {
  // untag it
  var uri = ios.newURI(url, null, null);
  tagssvc.untagURI(uri, [REAP_TAG]);
  if (deleteBookmark) {
    // if deleteBookmark is true, also remove the bookmark
    // TODO test this!
    var bookmarkIds = bmsvc.getBookmarkIdsForURI(uri);
    for (var i = 0; i < bookmarkIds.length; i++) {
      bmsvc.removeItem( bookmarkIds[i] );
    }
  }
}

function createBookmark(tab) {
  // See https://developer.mozilla.org/En/Places_Developer_Guide#Tagging_Service
  // https://developer.mozilla.org/en/Code_snippets/Bookmarks
  // Create bookmark, if it doesn't already exist, and add "tabreaper" tag to it.

  var uri = ios.newURI(tab.url, null, null);
  if (!bmsvc.isBookmarked(uri)) {
    bmsvc.insertBookmark(bmsvc.bookmarksMenuFolder, uri, bmsvc.DEFAULT_INDEX, tab.title);
  }
  tagssvc.tagURI(uri, [REAP_TAG]);
}

function getReapedTabs() {
  // Return all bookmarks taged tabreaper. Then we don't have
  // to maintain the tab underworld in memory or persist it across restarts.
  var urls = tagssvc.getURIsForTag(REAP_TAG);
  var reapedTabs = [];
  for (var i = 0; i < urls.length ; i++) {
    reapedTabs.push({title: "Something", url: urls[i].spec, favicon: data.url("favicon.ico")});
  }
  console.log(JSON.stringify(reapedTabs));
  return reapedTabs;
}

require("page-mod").PageMod({
  include: underworldPage,
  contentScriptWhen: "start",
  contentScriptFile: data.url("underworld-content-script.js"),
  onAttach: function(worker) {
    worker.port.on("getDeadTabs", function() {
      worker.port.emit("deadTabs", JSON.stringify(getReapedTabs()));
    });
    worker.port.on("removeTab", function(data) {
                     data = JSON.parse(data);
                     switch(data.action) {
                     case "forget":
                       unTag(data.url, true);
                       break;
                     case "reopen":
                       unTag(data.url, true);
                       tabs.open(data.url);
                       break;
                     case "archive":
                       unTag(data.url, false);
                       break;
                     }
    });
    // TODO also "archiveTab" which calls unTag(url, false);
    // TODO maybe combine these three into one handler since they're so similar.
  }
});


// https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/adding-menus.html
var menuitem = require("menuitems").Menuitem({
  id: "tabreaper_openUnderworld",
  menuid: "goPopup",
  label: "Tab Underworld",
  onCommand: function() {
    tabs.open(underworldPage);
  },
  insertbefore: "startHistorySeparator",
  image: data.url("favicon.ico")
});

console.log("Getting ready to reap your tabs!");
var reaperNamespace = namespace.ns();
/*
 * see
https://addons.mozilla.org/en-US/developers/docs/sdk/latest/packages/api-utils/namespace.html

https://addons.mozilla.org/en-US/developers/docs/sdk/latest/packages/addon-kit/tabs.html
*/

// Initialize last-used time for all tabs already open:
for each (var tab in tabs) {
  reaperNamespace(tab).lastUsed = Date.now();
  console.log("Tab last used at " + reaperNamespace(tab).lastUsed);
}

// Set last-used time when a tab opens:
tabs.on("open", function(tab) {
          reaperNamespace(tab).lastUsed = Date.now();
        });

// Update the last-used time if you activate a tab for more than MIN_ACTIVE_TIME:
tabs.on("activate", function(tab) {
          console.log("Tab activated...");
          reaperNamespace(tab).timer = timers.setTimeout(function() {
              reaperNamespace(tab).lastUsed = Date.now();
              console.log("Tab used at " + reaperNamespace(tab).lastUsed);
              reaperNamespace(tab).timer = null;
            }, MIN_ACTIVE_TIME);
        });

tabs.on("deactivate", function(tab) {
          if ( reaperNamespace(tab).timer ) {
            console.log("Too short.");
            timers.clearTimeout( reaperNamespace(tab).timer );
          }
          // TODO if it's not the too-short case, how about setting the last used now - i.e. start
          // the count when you *stop* looking at the active tab, not when you start looking at it.
        });


var reaperTimer = timers.setInterval(function() {
  console.log("Reaping.");
  var now = Date.now();
  var maxTabAge = getMaxTabAge();
  for each (var tab in tabs) {
    if (tab.isPinned) {
      // don't reap app tabs
      continue;
    }
    if (tabs.activeTab == tab) {
      // don't reap the active tab
      console.log("Skipping the active tab.");
      // in fact, keep updating its last-used time:
      reaperNamespace(tab).lastUsed = Date.now();
      continue;
    }
    var tabAge = now - reaperNamespace(tab).lastUsed;
    console.log("Tab at " + tab.url + " has not been used in " + tabAge);
    // Find tabs that are older than max age:
    if (tabAge > maxTabAge) {
      console.log("YOUR TIME HAS COME, TAB!");
      if (urlsToIgnore.indexOf(tab.url) == -1) {
        // Don't bookmark it if it's in the "tabs to ignore" list.
        createBookmark(tab);
      }
      // close it!
      tab.close();
    }
  }
}, CHECK_INTERVAL);