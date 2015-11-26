var adminDataTracker = new Tracker.Dependency;
var user_tracker = new Tracker.Dependency;
var artwork_mod_tracker = new Tracker.Dependency;

var admin_data = undefined;

var all_users = [];

var updateAdminData = function() {
	Meteor.call('getAdminData', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			admin_data = result
			adminDataTracker.changed();
		}
	})
}

var updateUsers = function() {
	Meteor.call('getUsers', function(error, result) {
		if (error)
			console.log(error.message);

		else {
			all_users = result;
			user_tracker.changed();
		}
	})
}

var setAdminData = function(set_id, value) {
	switch(set_id) {
		case 'set_level': 
			Meteor.call('setPlayerLevel', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			});
			break;

		case 'set_xp':
			Meteor.call('setXP', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			})
			break;

		case 'set_daily_drop': 
			Meteor.call('updateDailyDropCount', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			});
			break;

		case 'set_crate_drop': 
			Meteor.call('updateCrateDropCount', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			})
			break;

		case 'set_bank_balance':
			Meteor.call('setBankBalance', Number(value), function(error) {
				if (error)
					console.log(error.message);

				else updateAdminData();
			})
			break;

		case 'set_seasonal':
			var ids_string = value;
			var id_array = ids_string.replace(/ /g , "").split(",");
			Meteor.call('setSeasonal', id_array, function(error) {
				if (error)
					console.log(error.message);
			});    		

		default: return;
	}

	adminDataTracker.changed();
}


Template.adminTools.events({
	'click #reset-daily' : function(element) {
		Meteor.call('resetDailyDrop', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #new-seasonals' : function(element) {
		var seasonal_count = 1;
		var id_array = [];
		for (var i=0; i < seasonal_count; i++) {
			var selector = {
				'._id': {$nin: id_array}, 
				'rarity': {
					$in: ["legendary", "masterpiece"]
				}
			};

			var artwork_object = artworks.findOne(selector, {skip: Math.floor(Math.random() * artworks.find(selector).count())});

			if (artwork_object)
				id_array.push(artwork_object._id);
		}

		Meteor.call('setSeasonal', id_array, function(error) {
			if (error)
				console.log(error.message);

			else updateAdminData();
		});
	},

	'click #generate-for-sale' : function(element) {
		Meteor.call('generateForSale', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #clear-unclaimed' : function(element) {
		Meteor.call('clearUnclaimed', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #clear-for-sale' : function(element) {
		Meteor.call('clearForSale', function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click #generate-npc' : function(element) {
		var attribute_id = $('.npc-selector').val();
		Meteor.call('generateNPC', attribute_id, function(error) {
			if (error)
				console.log(error.message);
		})
	},

	'click .text-field' : function(element) {
		var target = $(element.target);
		var current = target.html();
		var id = $(element.target).attr('id');
		//target.replaceWith('<input id="' + id + '" class="set-field" value="' + current + '"></input>');
		//target.css('display', "none");
		//target.closest('.set-container').find('.set-field').css('display', "block");
	},

	'blur .set-field' : function(element) {
		var target = $(element.target);
		var value = target.val();
		var id = target.attr('id');
		var set_id = target.closest('.set-container').data().set_id;
		//target.replaceWith('<p id="' + id + '" class="text-field">' + value + '</p>');
		//target.css('display', "none");
		//target.closest('.set-container').find('.text-field').css('display', "block");

		setAdminData(set_id, value);
	},

	'keydown .set-field' : function(element) {
        if (element.keyCode == 13) {
			var target = $(element.target);
			var value = target.val();
			var id = $(element.target).attr('id');
			var set_id = target.closest('.set-container').data().set_id;
			//target.replaceWith('<p id="' + id + '" class="text-field">' + value + '</p>');
			// target.css('display', "none");
			// target.closest('.set-container').find('.text-field').css('display', "block");

			setAdminData(set_id, value);
        }
    },

    'click #generate-item' : function(element) {
    	var user_id = $('.user-selector').val();
    	var artwork_id = $('#generate-artwork-id').val();
    	var condition = $('#condition').val();
    	var xp_rating = $('#xp-rating').val();
    	var foil = $('.foil-selector').val() == "true";
    	var seasonal = $('.seasonal-selector').val() == "true";
    	var lottery = $('.lottery-selector').val();

    	Meteor.call('generateItemFromArtworkID', user_id, artwork_id, Number(condition) / 100, Number(xp_rating) / 100, foil, seasonal, Number(lottery), function(error, result) {
    		if (error)
    			console.log(error.message);

    		if (result === undefined)
    			console.log("an error has occurred");
    	});
    },

    'click #generate-random-item' : function(element) {
    	var artwork_id = $('#random-artwork-id').val();
    	var user_id = $('.user-selector-random').val();

    	Meteor.call('generateRandomItemFromArtworkID', user_id, artwork_id, function(error, result) {
    		if (error)
    			console.log(error.message);

    		if (result === undefined)
    			console.log("an error has occurred");
    	});
    },

    'click #modify-profiles' : function(element) {
    	var field_name = $('#profile-add-field').val();
    	var entered_value = $('#profile-add-value').val();
    	var value;

    	if (field_name === "" || field_name.indexOf(" ") != -1)
    		console.log("invalid request");

    	if (typeof(entered_value) == "string" && entered_value.length == 0) {
    		if (confirm("warning: This action could potentially erase data from the player database. Are you sure you want to do this?"))
    			value = "";

    		else return;
    	}

    	else if (entered_value === "false")
    		value = false;

    	else if (entered_value === "true")
    		value = true;

    	else if (isNaN(entered_value)) 
    		value = entered_value;

    	else value = Number(entered_value);
    	
    	Meteor.call('updateProfiles', field_name, value, function(error) {
    		if (error)
    			console.log(error.message);
    	})
    },

    'click #alert-users' : function(element) {
    	var message = $('#alert-users-text')[0].value;
    	Meteor.call('alertAllUsers', message, function(error) {
    		if (error)
    			console.log(error.message);
    	})
    },

    'click .attribute-toggle' : function(element) {
    	var attribute_id = $(element.target).closest('.attribute-toggle').data().attribute_id;
    	Meteor.call('toggleAttributeStatus', attribute_id, function(error) {
    		if (error)
    			console.log(error);
    	})
    },

    'click #generate-link' : function() {
    	var attribute_data = attributes.find().fetch();
		var data = "text/json;charset=utf-8," + "var downloaded_attribute_data = " + encodeURIComponent(JSON.stringify(attribute_data)) + "; ";

		Meteor.call('generateDBString', function(error, result) {
			if (error)
				console.log(error.message);

			else {
				var download_link = $('<a>download databases</a>');
				download_link.attr("href", 'data:' + result);
				download_link.attr("download", 'data.json');

				$('#download-area').append(download_link);
			}
		})
    },

    'change .attribute-selector' : function(event) {
    	var container = $(event.target).closest('.legendary-container');
    	var attribute_id_array = [];

    	for (var i=0; i < container.find('.attribute-selector').length; i++) {
    		attribute_id_array.push(container.find('.attribute-selector:eq(' + i + ')').val());
    	}

    	Meteor.call('updateLockedAttributes', container.data().artwork_id, attribute_id_array, function(error) {
    		if (error)
    			console.log(error.message);
    	})
    },

    'change .artwork-selector' : function() {
    	artwork_mod_tracker.changed();
    },

	'click #update-artwork': function(element) {
		$(document.activeElement).blur();

		var artwork_id = $('.artwork-selector').val();

		if (artwork_id == "unselected")
			return;

		var artwork_object = generateArtworkObject();
		var artwork_keys = Object.keys(artwork_object);

		if (artwork_id == "new artwork") {
			for (var i=0; i<artwork_keys.length; i++) {
				var key = artwork_keys[i];
				if (artwork_object[key] === "")
					return;
			}

			Meteor.call('addNewArtwork', artwork_object, function(error, result) {
				if (error)
					console.log(error.message);

				else {
					$('.artwork-selector').append('<option value="' + result + '">' + artwork_object.artist + ' - ' + artwork_object.title + '</option>');
					$('.artwork-selector').val(result);
					artwork_mod_tracker.changed();
				}
			});
		}

		else {
			var existing_artwork_object = (artworks.findOne(artwork_id));

			for (var i=0; i<artwork_keys.length; i++) {
				var key = artwork_keys[i];
				if (artwork_object[key] === "")
					artwork_object[key] = existing_artwork_object[key];
			}

			Meteor.call('updateArtworkData', artwork_id, artwork_object, function(error, result) {
				if (error)
					console.log(error.message);

				else artwork_mod_tracker.changed();
			});
		}
	}
})

var generateArtworkObject = function() {
	var artist_object = artists.findOne($('#artwork-mod-container').find('.artwork-mod-artist-selector').val());

	var artwork_object = {
		'artist': artist_object.artist_name,
		'artist_id': artist_object._id,
		'date': Number($('#artwork-mod-date').val()),
		'filename': $('#artwork-mod-filename').val(),
		'genre': $('#artwork-mod-genre').val(),
		'height': Number($('#artwork-mod-height').val()),
		'medium': $('#artwork-mod-medium').val(),
		'title': $('#artwork-mod-title').val(),
		'value_scale': Number($('#artwork-mod-value-scale').val()),
		'width': Number($('#artwork-mod-width').val()),		
		'nsfw': $('#artwork-mod-container').find('.nsfw-selector').val() == "true" ? true : false,
		'rarity': $('#artwork-mod-container').find('.rarity-selector').val(),
		'active': $('#artwork-mod-container').find('.active-selector').val() == "true" ? true : false,
	}

	return artwork_object;
}

Template.adminTools.helpers({
	'adminData' : function() {
		adminDataTracker.depend();

		if (admin_data == undefined)
			updateAdminData();

		else return admin_data;
	},

	'attribute' : function() {
		return attributes.find();
	},

	'selectorChoice' : function(locked_attribute_ids) {
		return attributes.find({'_id': {$nin: locked_attribute_ids}, 'active': true});
	},

	'legendary_found' : function() {
		return artworks.find({'rarity': {$in: ["masterpiece", "legendary"]}});
	},

	'npcName' : function(attribute_id) {
		return attributes.findOne(attribute_id).npc_name;
	},

	'npc' : function() {
		return attributes.find({'active': true}).fetch()
	},

	'user' : function() {
		user_tracker.depend();

		if (all_users.length == 0) {
			updateUsers();
			return [];
		}

		else return all_users;
	},

	'current_user' : function() {
		return Meteor.user().profile.screen_name;
	},

	'current_id' : function() {
		return Meteor.userId();
	},

	'selected_artwork' : function() {
		artwork_mod_tracker.depend();
		var artwork_object = artworks.findOne($('.artwork-selector').val())
		return artwork_object;
	},

	'artwork' : function() {
		return artworks.find({}, {sort: {'artist': 1}});
	},

	'imageSize' : function(width, height) {
		var max_width = 500;
		var max_height = 500;

		var original_ratio = width / height;

		var height_when_width_maxed = max_width / original_ratio;

		if (height_when_width_maxed > max_height) {
			return {
				'image_width': Math.floor(original_ratio * max_height),
				'image_height': max_height
			}
		}

		else return {
			'image_width': max_width,
			'image_height': max_width / original_ratio
		} 
	},

	'rarity_choice' : function(current_rarity) {
		var rarities = ["common", "uncommon", "rare", "legendary", "masterpiece"];
		if (rarities.indexOf(current_rarity) != -1)
			rarities.splice(rarities.indexOf(current_rarity), 1);
		
		return rarities;
	},

	'artist_choice' : function(current_artist_id) {
		return artists.find({'_id': {$ne: current_artist_id}});
	}
})

Template.adminTools.rendered = function() {
	updateAdminData();
}