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
  return parseInt(prefs["tabreaper.max_tab_age"]) * 60 * 1000;
  // TODO should be another *60 (hours) but I'm doing minutes for debug purposes.
}

var underworldPage = data.url("ui/underworld.html");

// Storage for tabs that have been reaped:
var tabUnderworld = [];
// Persistent across sessions
if (storage.tabUnderworld) {
  tabUnderworld = storage.tabUnderworld;
}

function removeTab(url) {
  // TODO instead of doing this, just remove the tabreaper tag from the bookmark.
  // TODO "archive" command removes tag but keeps bookmark, "forget" command removes bookmark.
  for (var i = 0; i < tabUnderworld.length; i++) {
    if (tabUnderworld[i].url == url) {
      tabUnderworld.splice(i, 1);
    }
  }
  storage.tabUnderworld = tabUnderworld;
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
  return tagssvc.getURIsForTag(REAP_TAG);
}

require("page-mod").PageMod({
  include: underworldPage,
  contentScriptWhen: "start",
  contentScriptFile: data.url("underworld-content-script.js"),
  onAttach: function(worker) {
    worker.port.on("getDeadTabs", function() {
      worker.port.emit("deadTabs", JSON.stringify(getReapedTabs()));
    });
    worker.port.on("removeTab", function(url) {
      removeTab(url);
    });
    worker.port.on("reviveTab", function(url) {
      tabs.open(url);
      removeTab(url);
    });
  }
});

// https://addons.mozilla.org/en-US/developers/docs/sdk/latest/dev-guide/tutorials/adding-menus.html
var widget = widgets.Widget({
  id: "tab-underworld-link",
  label: "Tab Underworld",
  contentURL: data.url("favicon.ico"),
  onClick: function() {
    tabs.open(underworldPage);
  }
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
      if (tab.url != underworldPage) {
        // Send it to the Tab Underworld - except don't add the tab underworld page to itself.
        tabUnderworld.push({title: tab.title, url: tab.url, favicon: tab.favicon});
        storage.tabUnderworld = tabUnderworld;
        createBookmark(tab);
      }
      // close it!
      tab.close();
    }
  }
}, CHECK_INTERVAL);