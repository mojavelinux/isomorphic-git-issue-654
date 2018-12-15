const fs = require('fs-extra')
const git = require('isomorphic-git')
const GitServer = require('node-git-server')
const path = require('path')

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

    const repo = { fs, dir: path.join(reposDir, repoName + '.git') }
    const url = `http://localhost:${gitServerPort}/${path.basename(repo.dir)}`

    await git.init(repo)

    // NOTE must commit at least two files here to reproduce hang
    await fs.writeFile(path.join(repo.dir, '.gitignore'), '')
    await git.add({ ...repo, filepath: '.gitignore' })
    await fs.writeFile(path.join(repo.dir, 'README.adoc'), '= README')
    await git.add({ ...repo, filepath: 'README.adoc' })
    await git.commit({ ...repo, author, message: 'initial commit' })

    await fs.ensureDir(path.join(repo.dir, 'pages'))
    await fs.writeFile(path.join(repo.dir, 'pages/page-one.adoc'), '= Page One')
    await git.add({ ...repo, filepath: 'pages/page-one.adoc' })
    await git.commit({ ...repo, author, message: 'add page' })

    const repoCloneDir = path.join(reposDir, repoName + '-clone.git')
    const repoClone = { fs, dir: repoCloneDir, gitdir: repoCloneDir }
    await git.clone({ ...repoClone, url, depth: 1, noCheckout: true, noTags: true })
      // NOTE uncommenting the next line will circumvent the hang
      //.then(() => fs.emptyDir(path.join(repoClone.gitdir, 'refs', 'heads')))

    await fs.writeFile(path.join(repo.dir, 'pages/page-one.adoc'), '= Page One\n\nContent updated!')
    await git.add({ ...repo, filepath: 'pages/page-one.adoc' })
    await git.commit({ ...repo, author, message: 'save changes' })

    await git.fetch({ ...repoClone, depth: 1, noCheckout: true })
    await git.resolveRef({ ...repoClone, ref: 'remotes/origin/master' })
      .then((oid) => git.readObject({ ...repoClone, oid }))
    console.log('done')
  } finally {
    await new Promise((resolve, reject) => gitServer.server.close((err) => (err ? reject(err) : resolve())))
  }
})()
