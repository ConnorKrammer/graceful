/**
 * graceful-documents
 *
 * Adds the DocumentManager class and the Document class. Objects created with
 * the DocumentManager class are responsible for manipulating Document objects
 * and file revisions.
 *
 * Note the use of the javascript promise library, q, for asynchronous code.
 * See here (https://github.com/kriskowal/q) for more on understanding async promises.
 */


!function(global) {
  'use strict';

  /**
   * DocumentManager constructor.
   *
   * Objects created with this class are responsible for
   * manipulating Document objects and file revisions.
   *
   * @param {object} The Editor object to open documents in.
   * @return {object} The constructed DocumentManager.
   */
  function DocumentManager(editor) {

    // Return a null object if the editor isn't valid.
    if (!editor) return null;

    // Initialize.
    this.editor = editor,
    this.documentList = [],
    this.lastDocumentID = 0

    return this;
  }

  /**
   * Loads a file into the editor workspace.
   *
   * @param {object|string} doc The document to open.
   * @return {promise} A promise for the operation.
   */
  DocumentManager.prototype.open = function(doc) {
    var self = this;

    // Don't open the document twice.
    // TODO: Allow multiple panes to edit the same document.
    if (doc.isOpen) return;

    return FileSystem.readFile(doc.path)
      .then(function(data) {
        var editor = self.editor;

        // Add an input pane and load in the document contents.
        // The path is used as a unique ID because same path = same document.
        // TODO: Resume opened document objects, so that the editor check doesn't need to be made.
        //       Instead, doc.isOpen will be true every time there's an input pane for a document.
        if (editor.getInputPane(doc.path) === false) {
          editor.addInputPane(doc.path);
        }

        editor.getInputPane(doc.path).val(data);
        editor.switchToInput(doc.path);
        doc.textarea = editor.getInputPane(doc.path);
        doc.savedData = data;

        // Register textarea changes.
        editor.container.on('change.editor', function() {
          if (editor.inputPane === doc.textarea) {
            doc.hasChanges = true;
          }
        });

        return FileSystem.fileExists(doc.revisionPath);
      })
      .then(function(doesExist) {
        return doesExist ? FileSystem.readFile(doc.revisionPath) : false;
      })
      .then(function(data) {
        if (data) {
          var revisions = JSON.retrocycle(JSON.parse(data));
          doc.revisions = revisions;
        }

        // Keep a reference to all open documents.
        self.documentList.push(doc);
        doc.id = self.lastDocumentID;
        self.lastDocumentID++;
        doc.isOpen = true;
      })
      .fail(function(error) {
        console.log(error.stack);
      });
  };

  /**
   * Removes a document from the editing workspace.
   *
   * If there are unsaved changes on the document, the user will be
   * prompted to save them first.
   *
   * @param {object} doc The document to close.
   * @return {promise} A promise for the operation.
   */
  DocumentManager.prototype.close = function(doc) {
    var self = this;

    return Q.fcall(function() {
        if (!doc.hasChanges) return;

        alert("Your document has changes. These will be saved first.");
        return self.save(doc);
      })
      .then(function() {
        self.editor.removeInputPane(doc.path);
        _.pull(self.documentList, doc);
        doc.isOpen = false;
      })
      .fail(function(error) {
        console.log(error.stack);
      });
  };

  /**
   * Saves a document's contents.
   *
   * @param {object} doc The document to save.
   * @return {promise} A promise for the operation.
   */
  DocumentManager.prototype.save = function(doc) {
    return FileSystem.writeFile(doc.path, doc.textarea.val())
      .then(function() {
        doc.savedData = doc.textarea.val();
        doc.hasChanges = false;
      })
      .fail(function(error) {
        console.log(error.stack);
      });
  };

  /**
   * Updates a document's revlog.
   *
   * @param {string} message The commit message.
   * @return {promise} A promise for the operation.
   */
  DocumentManager.prototype.commit = function(doc, message) {
    var self = this;
    var deferred = Q.defer();
    var patch = VersionControl.makePatch(this.computeSnapshot(doc.revisions.head), doc.savedData);
    var revision = {
      id: doc.revisions.latestRevisionID + 1,
      depth: doc.revisions.head.depth + 1,
      parent1: doc.revisions.head,
      parent2: null,
      children: [],
      date: new Date(),
      patch: patch,
      message: message,
      snapshot: null
    };

    // (currently disabled)
    // Store a snapshot if the revision is 10 revisions in distance
    // from the next closest revision with a snapshot stored.
    if (revision.depth % 10 === 0) {
      // revision.snapshot = doc.computeSnapshot(revision);
    }

    // Include the revision in the revision list.
    doc.revisions[revision.id] = revision;

    // Add the revision as a child of HEAD.
    doc.revisions.head.children.push(revision);

    // Increment the latest revision ID.
    doc.revisions.latestRevisionID++;

    // Set HEAD to the new revision.
    doc.revisions.head = revision;

    deferred.resolve();

    return deferred.promise
      .then(function() {
        var stringified = JSON.stringify(JSON.decycle(doc.revisions));
        return FileSystem.writeFile(doc.revisionPath, stringified);
      })
      .fail(function(error) {
        console.log(error.stack);
      });
  };

  DocumentManager.prototype.checkout = function(doc, commit) {
    // We'll just discard any unsaved changes for now.
    var revision = doc.revisions[commit];
    var snapshot = this.computeSnapshot(revision);
    doc.revisions.head = revision;
    doc.savedData = snapshot;
    doc.textarea.val(snapshot);
    this.editor.container.trigger('editor.changed');
  };

  /**
   * Gets a list of patches between a revision and one of its ancestors.
   *
   * If the specified ancestor is not actually an ancestor of the specified
   * revision, then patches will be gathered all the way back to the root node.
   * The same thing will happen if no ancestor is specified at all.
   *
   * @param {object} revision The revision to start with.
   * @param {object} ancestor The ancestor revision to stop at. Optional, defaults to root.
   * @return {array} An array of patches to go from ancestor to revision.
   */
  DocumentManager.prototype.computeDelta = function(revision, ancestor) {
    var patches = [];

    // Gather up all the patches.
    while (revision.parent1 && revision !== ancestor) {
      patches.push(revision.patch);
      revision = revision.parent1;
    }

    // Put the patches in chronological order.
    return patches.reverse();
  };

  /**
   * Computes the full text of a revision given its ancestors.
   *
   * @param {string} revision The revision to get the full text of.
   * @return {string|boolean} The computed text, or false on failure.
   */
  DocumentManager.prototype.computeSnapshot = function(revision) {
    var patches = [];

    // Find the most recent snapshot and apply the intermediate patches.
    while (revision) {
      if (revision.snapshot || !revision.parent1) {
        console.log(revision);
        return VersionControl.applyPatches(revision.snapshot, patches.reverse());
      }

      patches.push(revision.patch);
      revision = revision.parent1;
    }

    return false;
  };

  /**
   * Document constructor.
   *
   * The Document class is intended to store the state of a document, but not
   * to operate upon it or its contents. For document operations such as open()
   * or save(), look to the DocumentManager class.
   *
   * @param {string} name The name of the file.
   * @param {object} revisionFile A file containing a list of existing revisions.
   * @return {object} The constructed Document object.
   */
  function Document(path, revisionPath) {
    var pathRoot = path.substr(0, path.lastIndexOf('.'));

    // Whether this document is open or not.
    this.isOpen = false;

    // Default the revision file's path to the same as the
    // file, but with the '.d' extension.
    this.revisionPath = revisionPath || pathRoot + '.d';

    // The document path.
    this.path = path;

    // The document name.
    this.name = path.substr(path.lastIndexOf('/') + 1);

    // A unique ID for the document.
    // This will be assigned by a DocumentManager when open() is called.
    this.id = -1;

    // This stores any data written to disk.
    this.savedData = "";

    // The document's textarea. This can be used to get the current text.
    this.textarea = null;

    // This variable is to check for unsaved changes.
    this.hasChanges = false;

    // Initialize the base revision history.
    // This will be updated if a revision file exists.
    var latestRevisionID = 0;
    var root = {
      id: 0,
      depth: latestRevisionID,
      parent1: null,
      parent2: null,
      children: [],
      date: new Date(),
      patch: null,
      message: "",
      snapshot: ""
    };

    this.revisions = {
      latestRevisionID: latestRevisionID,
      0: root,
      head: root
    };

    return this;
  }

  // Expose globals.
  global.Document = Document;
  global.DocumentManager = DocumentManager;
}(this);

