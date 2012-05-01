function generateRow(tab) {
  var tr = $("<tr></tr>");
  tr.append($("<td></td>").html(tab.title));
  tr.append($("<img></img>").attr("src", tab.favicon));
  tr.append($("<td></td>").html(tab.url));

  var openLink = $("<a>Reopen</a>").click(function() {
    window.reviveTab(tab.url);
    regenTable();
  });

  var killLink = $("<a>Discard</a>").click(function() {
    window.removeTab(tab.url);
    regenTable();
  });

  var actionCell = $("<td></td>");
  actionCell.append(openLink);
  actionCell.append(killLink);
  tr.append(actionCell);
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
