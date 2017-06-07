db_calls = 0;

getOneFromCollection = function(source, collection, query, options) {
	// if (DEBUG) {
	// 	console.log("finding one from " + collection._name + " in " + source);
	// 	db_calls++;
	// }

	return collection.findOne(query, options);
}

getFromCollection = function(source, collection, query, options) {
	// if (DEBUG) {
	// 	console.log("finding from " + collection._name + " in " + source);
	// 	db_calls++;
	// }

	return collection.find(query, options);
}