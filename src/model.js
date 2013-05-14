// Sort facets by their document frequency
// ================

VALUES_BY_FREQUENCY = function(item1, item2) {
  return item1.value.referencedObjects.length === item2.value.referencedObjects.length 
    ? 0
    : (item1.value.referencedObjects.length > item2.value.referencedObjects.length ? -1 : 1);
};


// Load Items to populate the browser
// ----------------

function loadItems(file, cb) {
  var collection = new Data.Collection(projects_fixture);

  var session = new Ken.Session(collection);
  cb(null, session);
}