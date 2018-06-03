db_calls = 0;

getOneFromCollection = function(source, collection, query, options) {
	return collection.findOne(query, options);
}

getFromCollection = function(source, collection, query, options) {
	return collection.find(query, options);
}