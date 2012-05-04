
unsafeWindow.onTabUnderworldLoad = function(callback) {
  console.log("Underworld content script loaded.");
  self.port.on("deadTabs", function(tabList) {
    callback(tabList);
  });
  self.port.emit("getDeadTabs");
};

unsafeWindow.removeTab = function(url, action) {
  self.port.emit("removeTab", JSON.stringify({url: url, action: action}));
};
