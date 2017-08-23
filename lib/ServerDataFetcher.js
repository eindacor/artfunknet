fetcher_map = {};

getFetcher = function(name) {
	if (fetcher_map[name] == undefined) {
		fetcher_map[name] = new ServerDataFetcher(); 
	}
	return fetcher_map[name];
}

deleteFetcher = function(name) {
	delete fetcher_map[name];
}

ServerDataFetcher = function() {
	var tracker = new Tracker.Dependency;
	var data_returned;
	var tracker_dependent = false;

	this.getCallback = function() {
		return function(error, result) {
			if (error) {
				console.log(error);
			}
			else {
				data_returned = result;
				tracker.changed();
			}
		}
	}

	this.getTracker = function() {
		return tracker;
	}

	this.getData = function() {
		return data_returned;
	}
}