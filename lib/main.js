const widgets = require("widget");
const tabs = require("tabs");
const timers = require("timers");
const namespace = require("api-utils/namespace");
const data = require("self").data;
const storage = require("simple-storage").storage;

const MIN_ACTIVE_TIME = 4000; // Looking at a tab for less time than this doesn't
  // count as using it
const CHECK_INTERVAL = 30000; // How often to check for old tabs
const MAX_TAB_AGE = 60000; // Reap tabs that haven't been used in this long TODO make pref

var underworldPage = data.url("ui/underworld.html");

// Storage for tabs that have been reaped:
var tabUnderworld = [];
// Persistent across sessions
if (storage.tabUnderworld) {
  tabUnderworld = storage.tabUnderworld;
}

function removeTab(url) {
  // TODO remove all tabs with matching url from tabUnderworld if there are more than one
  for (var i = 0; i < tabUnderworld.length; i++) {
    if (tabUnderworld[i].url == url) {
      tabUnderworld.splice(i, 1);
    }
  }
  storage.tabUnderworld = tabUnderworld;
}


require("page-mod").PageMod({
  include: underworldPage,
  contentScriptWhen: "start",
  contentScriptFile: data.url("underworld-content-script.js"),
  onAttach: function(worker) {
    worker.port.on("getDeadTabs", function() {
      worker.port.emit("deadTabs", JSON.stringify(tabUnderworld));
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
  id: "mozilla-link",
  label: "Tab Underworld",
  contentURL: "http://www.mozilla.org/favicon.ico",
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
    if (tabAge > MAX_TAB_AGE) {
      console.log("YOUR TIME HAS COME, TAB!");
      // Send it to the Tab Underworld:
      tabUnderworld.push({title: tab.title, url: tab.url, favicon: tab.favicon});
      storage.tabUnderworld = tabUnderworld;
      tab.close();
    }
  }
}, CHECK_INTERVAL);