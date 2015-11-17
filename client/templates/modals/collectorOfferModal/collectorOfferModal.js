Template.collectorOfferModal.helpers({
	'itemId' : function() {
		if (Session.get('selectedItem')) 
			return Session.get('selectedItem');

		else return "";
	},

	'offerData' : function() {
		try {
			if (Session.get('npc_interaction')) {
				var item_object = Session.get('npc_interaction').item;
				var artwork_object = artworks.findOne(item_object.artwork_id);
					
				return {
					'offer': getCommaSeparatedValue(Session.get('npc_interaction').offer),
					'item' : item_object,
					'title' : artwork_object.title,
					'artist' : artwork_object.artist,
				}
			}

			else return {
				'offer': "",
				'item': {},
				'title' : "",
				'artist' : "",
			}
		}

		catch(error) {
			return {
				'offer': "",
				'item': {},
				'title' : "",
				'artist' : "",
			}
		}
	},

	'imageInfo' : function(item_id) {
		try {
			var item_object = items.findOne(item_id);
			var artwork_object = artworks.findOne(item_object.artwork_id);

			var max_dimension = 400;

			var width = artwork_object.width;
			var height = artwork_object.height;
			var ratio = width / height;

			var info_object = {
				'image_width' : 0,
				'image_height' : 0,
				'filename' : artwork_object.filename,
				'imageURL' : artwork_object.img_link == "" ? "http://go-grafix.com/data/wallpapers/35/painting-626297-1920x1080-hq-dsk-wallpapers.jpg" : artwork_object.img_link
			};

			if (width > height) {
				info_object.image_width = max_dimension;
				info_object.image_height = Math.floor(max_dimension / ratio);
			}

			else {
				info_object.image_height = max_dimension;
				info_object.image_width = Math.floor(max_dimension * ratio);
			}

			return info_object;
		}

		catch(error) {
			return {
				'image_width' : 0,
				'image_height' : 0,
				'filename' : ""
			};
		}
	},

	'attributeData' : function(item_id) {
		var item_object = items.findOne(item_id);
		if (item_object) {
			var artwork_object = artworks.findOne(item_object.artwork_id);

			var primary_attributes = [];
			var secondary_attributes = [];
			var attributes = item_object.attributes;

			for(var i=0; i < attributes.length; i++) {
				if (attributes[i].type == "primary")
					primary_attributes.push(attributes[i]);

				else secondary_attributes.push(attributes[i]);
			}

			return {
				'show_primary' : primary_attributes.length,
				'primary_attribute' : primary_attributes,
				'show_secondary' : secondary_attributes.length,
				'secondary_attribute' : secondary_attributes
			}
		}

		else return {
			'show_primary' : false,
			'primary_attribute' : [],
			'show_secondary' : false,
			'secondary_attribute' : []
		}
	},

	'attributeValueText' : function(value) {
		return Math.floor(value * 100);
	},

	'isQuestItem' : function(artwork_id) {
		return quests.findOne({'owner_id': Meteor.userId(), 'target': {$in: [artwork_id]}}) != undefined;
	}
})

Template.collectorOfferModal.events({
	'click #close-button' : function() {
		Modal.hide('collectorOfferModal');
	},

	'click #accept-offer' : function() {
		if (Session.get('npc_interaction') != undefined) {
			Meteor.call('acceptCollectorOffer', Session.get('npc_interaction'), function(error) {
				if (error)
					console.log(error.message);

				else {
					Session.set('npc_interaction', undefined);
					Modal.hide('collectorOfferModal');
				}
			});
		}

		else console.log("an error has occurred");
	}
})