var _
  , async = require('async')
  , bplist = require('bplist-parser')
  , clc = require('cli-color')
  , fs = require('fs')
  , inquirer = require('inquirer')
  , moment = require('moment')
  , path = require('path')
  , plist = require('plist')
  , sprintf = require('sprintf-js').sprintf
  , sqlite3 = require('sqlite3')
  , wrap = require('wordwrap')(24, 80)
  ;

var backupDir = path.join(process.env.HOME, 'Library', 'Application Support', 'MobileSync', 'Backup');
getBackupInfo(backupDir, function(err, backups) {
  var length = longestStringLength(backups, 'name');
  backups.sort(function(a, b) { return a.date.getTime() < b.date.getTime() });

  inquirer.prompt([{
    type: 'list',
    name: 'backup',
    message: 'Which backup would you like to use?',
    choices: backups.map(function(backup, i) {
      return {
        name: sprintf('%-' + length + 's  %s', backup.name, moment(backup.date).format('YYYY-MM-DD hh:mm:ss A')),
        value: backup.path
    }})
  }], function(answers) {
    readBackup(answers.backup);
  })
});

function getBackupInfo(backupDir, callback) {
  function getMagic(file) {
    var magicLen = 6;
    var buffer = new Buffer(magicLen);
    var fd = fs.openSync(file, 'r');
    fs.readSync(fd, buffer, 0, magicLen);
    return buffer.toString();
  }

  async.waterfall([function(cb) {
      fs.readdir(backupDir, cb);
    }, function(contents, cb) {
      var infoPaths = contents.map(function(dir) { return path.join(backupDir, dir, 'Info.plist'); });
      async.filter(infoPaths, fs.exists, function(results) { cb(null, results); });
    }, function(files, cb) {
      async.map(files, function(file, cb) {
        if (getMagic(file) == 'bplist') {
          bplist.parseFile(file, function(err, contents) {
            cb(null, {path: path.dirname(file), contents: contents[0]});
          });
        } else {
          var contents = plist.parseFileSync(file);
          cb(null, {path: path.dirname(file), contents: contents});
        }
      }, cb);
    }, function(infos, cb) {
      cb(null, infos.map(function(info) {
        return { path: info.path, name: info.contents['Device Name'], date: info.contents['Last Backup Date'] };
      }));
    }
  ], callback);
}

function readBackup(backupDir) {
  var dbpath = path.join(backupDir, '3d0d7e5fb2ce288813306e4d4636395e047a3d28');
  console.log(dbpath);
  var db = new sqlite3.Database(dbpath, sqlite3.OPEN_READONLY);
  db.serialize(function() {

    db.all('SELECT handle.ROWID ROWID, handle.id id, handle.service service FROM message, handle WHERE message.handle_id = handle.ROWID GROUP BY message.handle_id ORDER BY message.date DESC', function(err, results) {
      var length = longestStringLength(results, 'id');
      inquirer.prompt([{
        type: 'list',
        name: 'contact',
        message: 'Which contact would you like to see?',
        choices: results.map(function(result) {
          return {
            name: sprintf('%-' + length + 's %s', result.id, result.service),
            value: result.ROWID
        }}).concat([new inquirer.Separator(sprintf('%\'-' + (length + 9) + 's', ''))])
      }], function(answers) {
        db.all('SELECT date, text, is_from_me FROM message WHERE handle_id = ? ORDER BY date', [answers.contact], function(err, results) {
          results.forEach(function(result) {
            var date = (new moment(result.date * 1000 + 978325200000)).subtract('hours', 5).format('YYYY-MM-DD hh:mm:ss A');
            var text = wrap(result.text).substring(date.length);
            if (result.is_from_me) {
              console.log(date + text);
            } else {
              console.log(clc.white(date + text));
            }
          });
        });
      })
    });
  });
}

function longestStringLength(array, key) {
  return array.reduce(function(length, item) {
    item = key ? item[key] : item;
    return Math.max(length, item.length);
  }, 0);
}