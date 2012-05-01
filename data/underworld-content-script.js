
unsafeWindow.onTabUnderworldLoad = function(callback) {
  console.log("Underworld content script loaded.");
  self.port.on("deadTabs", function(tabList) {
    callback(tabList);
  });
  self.port.emit("getDeadTabs");
};

unsafeWindow.removeTab = function(url) {
  self.port.emit("removeTab", url);
};

unsafeWindow.reviveTab = function(url) {
  self.port.emit("reviveTab", url);
};