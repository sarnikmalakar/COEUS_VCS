#!/usr/bin/env node

import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'
import { diffLines } from 'diff'
import chalk from 'chalk'
import { Command } from 'commander'

const program = new Command()

class Coeus{
    constructor(repoPath = '.'){
        // This is when we will create an (.coeus) `folder` on typing (coeus init) `command` in the current directory 
        this.repoPath = path.join(repoPath, '.coeus')
        // .coeus/objects
        this.objectsPath = path.join(this.repoPath, 'objects')
        // .coeus/HEAD
        this.headPath = path.join(this.repoPath, 'HEAD')
        // .coeus/index
        this.indexPath = path.join(this.repoPath, 'index')
        // This is used to initialize the .coeus folder
        this.init()
    }

    async init(){
        await fs.mkdir(this.objectsPath, {recursive: true})
        try{
            // The purpose of wx is that it is open for writing, but fails if file already exist
            await fs.writeFile(this.headPath, '', {flag: 'wx'})  // This creates HEAD file
            await fs.writeFile(this.indexPath, JSON.stringify([]), {flag: 'wx'}) // This creates index file
        }catch(error){
            // We handel the error here if file already exist
            console.log("Already initialised the .coeus folder")
        }
    }

    hashObject(content){
        // Git actually uses SHA-1 hash which generates a 40 character hexadecimal string for any input
        return crypto.createHash('sha1').update(content, 'utf-8').digest('hex')
    }

    async add(fileToBeAdded){
        // fileToBeAdded: path/to/file
        const fileData = await fs.readFile(fileToBeAdded, {encoding: 'utf-8'}) //read the file
        const fileHash = this.hashObject(fileData) //hash of the file
        //console.log(fileHash) can be used for verification
        const newFileHashedObjectPath = path.join(this.objectsPath, fileHash) // .coeus/objects/hashCode of the file
        await fs.writeFile(newFileHashedObjectPath, fileData)
        await this.updateStagingArea(fileToBeAdded, fileHash)
        console.log(`Added ${fileToBeAdded}`)
    }

    async updateStagingArea(filePath, fileHash){
        const index = JSON.parse(await fs.readFile(this.indexPath, {encoding: 'utf-8'})) //read the index file
        index.push({path:filePath, hash: fileHash}) //add the file to index
        await fs.writeFile(this.indexPath, JSON.stringify(index)) //write the updated index file
    } 

    async commit(message){
        const index =JSON.parse(await fs.readFile(this.indexPath, {encoding: 'utf-8'}))
        const parentCommit = await this.getCurrentHead()

        const commitData = {
            timestamp:new Date().toISOString(),
            message,
            files:index,
            parent:parentCommit
        }

        const commitHash = this.hashObject(JSON.stringify(commitData))
        const commitPath = path.join(this.objectsPath, commitHash)
        await fs.writeFile(commitPath, JSON.stringify(commitData))
        await fs.writeFile(this.headPath, commitHash) //update the HEAD to the new commit
        await fs.writeFile(this.indexPath, JSON.stringify([])) //Clear the index from the staging area
        console.log(`Commit successfully created: ${commitHash}`)
    }

    async getCurrentHead(){
        try{
            return await fs.readFile(this.headPath, { encoding: 'utf-8' })
        }catch(error){
            return null
        }
    }

    async log() {
        let currentCommitHash = await this.getCurrentHead()
        while(currentCommitHash) {
            const commitData = JSON.parse(await fs.readFile(path.join(this.objectsPath, currentCommitHash), { encoding: 'utf-8' }))
            console.log(`X---------------X--------------X\n`)
            console.log(`Commit: ${currentCommitHash}\nDate: ${commitData.timestamp}\n\n${commitData.message}\n\n`)

            currentCommitHash = commitData.parent
        }
    }

    async showCommitDiff(commitHash) {
        const commitData = JSON.parse(await this.getCommitData(commitHash))
        if(!commitData) {
            console.log("Commit not found")
            return
        }
        console.log("Changes in the last commit are: ")

        for(const file of commitData.files) {
            console.log(`File: ${file.path}`)
            const fileContent = await this.getFileContent(file.hash)
            console.log(fileContent)

            if(commitData.parent) {
                // get the parent commit data
                const parentCommitData = JSON.parse(await this.getCommitData(commitData.parent))
                const getParentFileContent = await this.getParentFileContent(parentCommitData, file.path)
                if(getParentFileContent !== undefined) {
                    console.log('\nDiff:')
                    const diff = diffLines(getParentFileContent, fileContent)


                    diff.forEach(part => {
                        if(part.added) {
                            process.stdout.write(chalk.green("++" + part.value))
                        } else if(part.removed) {    
                            process.stdout.write(chalk.red("--" + part.value))
                        } else {
                            process.stdout.write(chalk.grey(part.value))
                        }
                    })
                    console.log()
                } else {
                    console.log("New file in this commit")
                }

            } else {
                console.log("First commit")
            }

        }
    }

    async getParentFileContent(parentCommitData, filePath) {
        const parentFile = parentCommitData.files.find(file => file.path === filePath)
        if(parentFile) {
            // get the file content from the parent commit and return the content
            return await this.getFileContent(parentFile.hash)
        }
    }

    async getCommitData(commithash) {
        const commitPath = path.join(this.objectsPath, commithash)
        try {
            return await fs.readFile(commitPath, { encoding: 'utf-8'})
        } catch(error) {
            console.log("Failed to read the commit data", error)
            return null
        }
    }

    async getFileContent(fileHash) {
        const objectPath = path.join(this.objectsPath, fileHash)
        return fs.readFile(objectPath, { encoding: 'utf-8' })
    }

}

program.command('init').action(async () => {
    const coeus = new Coeus()
})

program.command('add <file>').action(async (file) => {
    const coeus = new Coeus()
    await coeus.add(file)
})

program.command('commit <message>').action(async (message) => {
    const coeus = new Coeus()
    await coeus.commit(message)
})

program.command('log').action(async () => {
    const coeus = new Coeus()
    await coeus.log()
})

program.command('show <commitHash>').action(async (commitHash) => {
    const coeus = new Coeus()
    await coeus.showCommitDiff(commitHash)
})

program.parse(process.argv)
