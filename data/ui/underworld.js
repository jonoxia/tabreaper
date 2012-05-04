function generateRow(tab) {
  var tr = $("<tr></tr>");
  /*tr.append($("<td></td>").html(tab.title));
  tr.append($("<img></img>").attr("src", tab.favicon));*/
  tr.append($("<td></td>").html(tab.url));

  var openLink = $("<a>Reopen</a>").click(function() {
    window.removeTab(tab.url, "reopen");
    regenTable();
  });

  var killLink = $("<a>Discard</a>").click(function() {
    window.removeTab(tab.url, "forget");
    regenTable();
  });

  var archiveLink = $("<a>Archive</a>").click(function() {
    window.removeTab(tab.url, "archive");
    regenTable();
  });

  tr.append( $("<td></td>").append(openLink) );
  tr.append( $("<td></td>").append(killLink) );
  tr.append( $("<td></td>").append(archiveLink) );
  return tr;
}

function regenTable() {
  window.onTabUnderworldLoad(function(tabList) {
    tabList = JSON.parse(tabList);
    var table = $("#reaped-tabs-table");
    table.empty();
    for (var i = 0; i < tabList.length; i++) {
      table.append(generateRow(tabList[i]));
    }
  });
}

$(document).ready(regenTable);
