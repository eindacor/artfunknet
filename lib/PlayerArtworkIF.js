PlayerArtworkIF = function(player_interface, artwork_interface) {
	this.user_id = player_interface.getId();
	this.artwork_id = artwork_interface.getId();

	// TODO code duplicated in ItemIF.js
    this.getArchiveSignature = function(item_stub_data) {
        var archive_signature = "";
        if (item_stub_data.foil) {
            archive_signature += 'f';
        }

        if (item_stub_data.unlocked) {
            archive_signature += 'u';
        }

        if (item_stub_data.seasonal) {
            archive_signature += 's';
        }

        if (item_stub_data.lottery > 0) {
            archive_signature += 'l';
        }

        if (item_stub_data.vintage) {
            archive_signature += 'v';
        }

        if (archive_signature.length == 0) {
            archive_signature = "standard";
        }

        return archive_signature;
    }

	this.getDisplacedArchiveItem = function(item_stub_data) {
		var query = {
        	'owner': this.user_id,
            'artwork_id': this.artwork_id,
            'status': "archived",
            'displaced': false,
            'archive_signature': this.getArchiveSignature(item_stub_data)
        };

        return getOneFromCollection("ItemIF.js:getDisplacedArchiveItem", items, query);
	}

	this.getRecommendedStatus = function(item_stub_data) {
		var displaced_item = this.getDisplacedArchiveItem(item_stub_data);

		if (item_stub_data.original) {
			return {
				'displaced_item': undefined,
				'upgrade': false,
				'recommended': false
			}
		}

		return {
			'displaced_item': displaced_item,
			'upgrade': false,
			'recommended': displaced_item === undefined
		}
	}
}