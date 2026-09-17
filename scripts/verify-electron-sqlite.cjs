const Database = require('better-sqlite3')

const database = new Database(':memory:')
database.exec('CREATE TABLE abi_check (value TEXT NOT NULL)')
database.prepare('INSERT INTO abi_check (value) VALUES (?)').run('ok')
const value = database.prepare('SELECT value FROM abi_check').pluck().get()
database.close()

if (value !== 'ok') {
  throw new Error('better-sqlite3 Electron ABI verification failed')
}

console.log(
  `better-sqlite3 loaded under Electron ${process.versions.electron} (modules ${process.versions.modules})`
)
process.exit(0)
