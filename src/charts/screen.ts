import contrib from 'blessed-contrib'
import blessed from 'blessed'

var screen = blessed.screen()

//create layout and widgets

var grid = new contrib.grid({rows: 12, cols: 12, screen: screen})


var donut =  grid.set(0, 0, 5, 2, contrib.donut,
  {
  label: 'Node Count',
  radius: 16,
  arcWidth: 4,
  yPadding: 2,
  data: [{label: 'Percentage of Network Synced', percent: 87}]
})


var transactionsLine = grid.set(0, 2, 5, 8, contrib.line,
          { showNthLabel: 5
          , maxY: 100
          , label: 'Node Count over the past 7 days'
          , showLegend: true
          , legend: {width: 10}})


var map: any = grid.set(5, 0, 7, 6, contrib.map, {label: 'Regional Information'})

var bar = grid.set(5, 6, 7, 4, contrib.bar,
  { label: 'Client type distribution'
  , barWidth: 4
  , barSpacing: 6
  , xOffset: 2
  , maxHeight: 10})


//dummy data
var servers = ['US1', 'US2', 'EU1', 'AU1', 'AS1', 'JP1']
var commands = ['grep', 'node', 'java', 'timer', '~/ls -l', 'netns', 'watchdog', 'gulp', 'tar -xvf', 'awk', 'npm install']


//set dummy data on bar chart
function fillBar() {
  var arr = []
  for (var i=0; i<servers.length; i++) {
    arr.push(Math.round(Math.random()*10))
  }
  bar.setData({titles: servers, data: arr})
}
fillBar()
setInterval(fillBar, 2000)



//set map dummy markers
var marker = true
setInterval(function() {
   if (marker) {
    map.addMarker({"lon" : "-79.0000", "lat" : "37.5000", color: 'yellow', char: 'X' })
    map.addMarker({"lon" : "-122.6819", "lat" : "45.5200" })
    map.addMarker({"lon" : "-6.2597", "lat" : "53.3478" })
    map.addMarker({"lon" : "103.8000", "lat" : "1.3000" })
   }
   else {
    map.clearMarkers()
   }
   marker =! marker
   screen.render()
}, 1000)

//set line charts dummy data

var transactionsData = {
   title: 'Synced',
   style: {line: 'green'},
   x: ['30 April 23', '00:05', '00:10', '00:15', '00:20', '00:30', '00:40', '00:50', '01:00', '01:10', '01:20', '01:30', '01:40', '01:50', '02:00', '02:10', '02:20', '02:30', '02:40', '02:50', '03:00', '03:10', '03:20', '03:30', '03:40', '03:50', '04:00', '04:10', '04:20', '04:30'],
   y: [0, 20, 40, 45, 45, 50, 55, 70, 65, 58, 50, 55, 60, 65, 70, 80, 70, 50, 40, 50, 60, 70, 82, 88, 89, 89, 89, 80, 72, 70]
}

var transactionsData1 = {
   title: 'Unsynced',
   style: {line: 'red'},
   x: ['30 April 23', '1 May 23', '00:10', '00:15', '00:20', '00:30', '00:40', '00:50', '01:00', '01:10', '01:20', '01:30', '01:40', '01:50', '02:00', '02:10', '02:20', '02:30', '02:40', '02:50', '03:00', '03:10', '03:20', '03:30', '03:40', '03:50', '04:00', '04:10', '04:20', '04:30'],
   y: [0, 5, 5, 10, 10, 15, 20, 30, 25, 30, 30, 20, 20, 30, 30, 20, 15, 15, 19, 25, 30, 25, 25, 20, 25, 30, 35, 35, 30, 30]
}

var transactionsData2 = {
   title: 'Total',
   style: {line: 'blue'},
   x: ['30 April 23', '1 May 23', '00:10', '00:15', '00:20', '00:30', '00:40', '00:50', '01:00', '01:10', '01:20', '01:30', '01:40', '01:50', '02:00', '02:10', '02:20', '02:30', '02:40', '02:50', '03:00', '03:10', '03:20', '03:30', '03:40', '03:50', '04:00', '04:10', '04:20', '04:30'],
   y: [0, 5, 5, 10, 10, 15, 20, 30, 25, 30, 30, 20, 20, 30, 30, 20, 15, 15, 19, 25, 30, 25, 25, 20, 25, 30, 35, 35, 30, 30]
}


setLineData([transactionsData, transactionsData1, transactionsData2], transactionsLine)
// setLineData([latencyData], latencyLine)

setInterval(function() {
   setLineData([transactionsData, transactionsData1, transactionsData2], transactionsLine)
   screen.render()
}, 500)




function setLineData(mockData: any, line: any) {
  for (var i=0; i<mockData.length; i++) {
    var last = mockData[i].y[mockData[i].y.length-1]
    mockData[i].y.shift()
    var num = Math.max(last + Math.round(Math.random()*10) - 5, 10)
    mockData[i].y.push(num)
  }

  line.setData(mockData)
}


screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

// fixes https://github.com/yaronn/blessed-contrib/issues/10
screen.on('resize', function() {
  bar.emit('attach');
  donut.emit('attach');
  transactionsLine.emit('attach');
  map.emit('attach');
});

export const render = () => screen.render()
