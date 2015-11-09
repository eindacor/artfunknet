var adminDataTracker = new Tracker.Dependency;

var admin_data = undefined;

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

		default: return;
	}

	adminDataTracker.changed();
}

// "set_level" current=player_level button_id="level-set" button_label="set level"}}
// 					{{> settable_field set_id="set_daily_drop" current=daily_drop_count button_id="update-daily-drop-count" button_label="daily drop count"}}
// 					{{> settable_field set_id="set_crate_drop" current=crate_drop_count button_id="update-crate-drop-count" button_label="crate count"}}
// 					{{> settable_field set_id="set_bank_balance"

Template.adminTools.events({
	'click #reset-daily' : function(element) {
		Meteor.call('resetDailyDrop', function(error) {
			if (error)
				console.log(error.message);
		})
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
		var current = $(element.target).html();
		$(element.target).replaceWith('<input class="set-field" value="' + current + '"></input>');
	},

	'blur .set-field' : function(element) {
		var target = $(element.target);
		var value = target.val();
		var set_id = target.closest('.set-container').data().set_id;
		target.replaceWith('<p class="text-field">' + value + '</p>');

		setAdminData(set_id, value);
	},

	'keydown .set-field' : function(element) {
        if (element.keyCode == 13) {
			var target = $(element.target);
			var value = target.val();
			var set_id = target.closest('.set-container').data().set_id;
			target.replaceWith('<p class="text-field">' + value + '</p>');

			setAdminData(set_id, value);
        }
    },

    'click #generate-item' : function(element) {
    	var artwork_id = $('#artwork-id').val();
    	var condition = $('#condition').val();
    	var xp_rating = $('#xp-rating').val();
    	var foil = $('.foil-selector').val() == "true";

    	Meteor.call('generateItemFromArtworkID', Meteor.userId(), artwork_id, Number(condition) / 100, Number(xp_rating) / 100, foil, function(error, result) {
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
    }
})

Template.adminTools.helpers({
	'adminData' : function() {
		adminDataTracker.depend();

		if (admin_data == undefined)
			updateAdminData();

		else return admin_data;
	}
})

Template.adminTools.rendered = function() {
	updateAdminData();
}