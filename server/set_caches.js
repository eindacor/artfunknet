updateCaches = function(callback) {
	try {
		devLog("updating caches...");
		updateLootData();
		updateActiveArtworkCache();
		updateSerializedSpecialAttributeCombinationCache();
		updateArtworkDropOdds();
		
		// currently called by updateLootData()
		// updateBasicCrateUpcostFromAverageValue();

		updateArtworkDropMapCache();
		updateAverageItemValueByRarityCache();
		devLog("caches updated");

		if (callback != undefined) {
			callback();
		}
	}
	catch (error) {
		console.log(error);
		throw error;
	}
}

/*
	active artwork cache
		contains arrays of artwork objects for quick lookup

		key -> rarity
		value -> array of artwork objects
		also contains:
			key = serialized special attribute
			value = artwork id

		
*/