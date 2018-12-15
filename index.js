const fs = require('fs-extra')
const _fs = require('fs')
const git = require('isomorphic-git')
const GitServer = require('node-git-server')
const path = require('path')

git.plugins.set('fs', _fs)

;(async () => {
  const reposDir = 'tmp'
  const repoName = 'repo-name'
  const author = { name: 'Git', email: 'git@example.org' }
  let gitServerPort
  let gitServer

  gitServerPort = await new Promise((resolve, reject) =>
    (gitServer = new GitServer(reposDir, { autoCreate: false })).listen(0, function (err) {
      err ? reject(err) : resolve(this.address().port)
    })
  )

  try {
    await fs.remove(reposDir)

    const dir = path.join(reposDir, repoName + '.git')
    const url = `http://localhost:${gitServerPort}/${path.basename(dir)}`

    await git.init({ dir })

    // NOTE must commit at least two files here to reproduce hang
    await fs.writeFile(path.join(dir, '.gitignore'), '')
    await git.add({ dir, filepath: '.gitignore' })
    await fs.writeFile(path.join(dir, 'README.adoc'), '= README')
    await git.add({ dir, filepath: 'README.adoc' })
    await git.commit({ dir, author, message: 'initial commit' })

    await fs.ensureDir(path.join(dir, 'pages'))
    await fs.writeFile(path.join(dir, 'pages/page-one.adoc'), '= Page One')
    await git.add({ dir, filepath: 'pages/page-one.adoc' })
    await git.commit({ dir, author, message: 'add page' })

    const repoCloneDir = path.join(reposDir, repoName + '-clone.git')
    const repoClone = { dir: repoCloneDir, gitdir: repoCloneDir }
    await git.clone({ ...repoClone, url, depth: 1, noCheckout: true, noTags: true })
      // NOTE uncommenting the next line will circumvent the hang
    // await fs.emptyDir(path.join(repoClone.gitdir, 'refs', 'heads'))

    await fs.writeFile(path.join(dir, 'pages/page-one.adoc'), '= Page One\n\nContent updated!')
    await git.add({ dir, filepath: 'pages/page-one.adoc' })
    await git.commit({ dir, author, message: 'save changes' })

    await git.fetch({ ...repoClone, depth: 1, noCheckout: true })
    const oid = await git.resolveRef({ ...repoClone, ref: 'remotes/origin/master' })
    console.log('prepare to hang', oid)
    await git.readObject({ ...repoClone, oid })
    console.log('didnt hang')
    console.log('done')
  } finally {
    await new Promise((resolve, reject) => gitServer.server.close((err) => (err ? reject(err) : resolve())))
  }
})()
