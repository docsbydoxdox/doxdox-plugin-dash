const fs = require('fs');
const path = require('path');

const Handlebars = require('handlebars');

require('./helpers');

const admzip = require('adm-zip');
const temp = require('temp').track();
const sqlite3 = require('sqlite3').verbose();

/**
 * Dash export plugin for doxdox.
 *
 * @example parseInputs(inputs, {'parser': 'dox', 'layout': 'dash'}).then(content => console.log(content));
 * @param {Array} data Methods parsed using a doxdox parser.
 * @return {Promise} Promise with generated content.
 * @public
 */

const plugin = data => new Promise((resolve, reject) => {

    const zip = new admzip();
    const tempdb = temp.openSync('temp.sqlite');
    const db = new sqlite3.Database(tempdb.path);

    fs.readFile(path.join(__dirname, 'templates/method.hbs'), 'utf8', (err, contents) => {

        if (err) {

            return reject(err);

        }

        const methodTemplate = Handlebars.compile(contents);

        fs.readFile(path.join(__dirname, 'templates/Info.plist.hbs'), 'utf8', (err, contents) => {

            if (err) {

                return reject(err);

            }

            const plistTemplate = Handlebars.compile(contents);

            zip.addFile(
                `${data.title}.docset/Contents/Info.plist`,
                plistTemplate(data)
            );

            zip.addLocalFile(
                path.join(__dirname, 'templates/resources/bootstrap.min.css'),
                `${data.title}.docset/Contents/Resources/Documents/resources/`
            );

            zip.addLocalFile(
                path.join(__dirname, 'templates/resources/github.min.css'),
                `${data.title}.docset/Contents/Resources/Documents/resources/`
            );

            db.serialize(() => {

                db.run('CREATE TABLE searchIndex(id INTEGER PRIMARY KEY, name TEXT, type TEXT, path TEXT);');
                db.run('CREATE UNIQUE INDEX anchor ON searchIndex (name, type, path);');

                data.files.forEach(file => {

                    file.methods.forEach(method => {

                        zip.addFile(
                            `${data.title}.docset/Contents/Resources/Documents/${method.uid}.html`,
                            methodTemplate(method)
                        );

                        db.run('INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ($name, $type, $path);', {
                            '$name': method.name,
                            '$path': `${method.uid}.html`,
                            '$type': method.type.replace(/^[a-z]/, match => match.toUpperCase())
                        });

                        if (method.tags.property) {

                            method.tags.property.forEach(property => {

                                db.run('INSERT OR IGNORE INTO searchIndex(name, type, path) VALUES ($name, $type, $path);', {
                                    '$name': `${method.name}.${property.name}`,
                                    '$path': `${method.uid}.html#//apple_ref/cpp/Property/${property.name}`,
                                    '$type': 'Property'
                                });

                            });

                        }

                    });

                });

            });

            db.close(err => {

                if (err) {

                    return reject(err);

                }

                fs.readFile(tempdb.path, (err, contents) => {

                    if (err) {

                        return reject(err);

                    }

                    zip.addFile(
                        `${data.title}.docset/Contents/Resources/docSet.dsidx`,
                        contents
                    );

                    return resolve(zip.toBuffer());

                });

                return false;

            });

            return false;

        });

        return false;

    });

});

module.exports = plugin;
