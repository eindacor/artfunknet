admin_settings = {
	'daily_drop_count': 6,
	'crate_drop_count': 6,
}

var adminValidated = function() {
	var user_object = Meteor.user();
	return user_object && user_object.profile.user_type == "admin";
}

Meteor.methods({
	'setPlayerLevel': function(level) {
		if (adminValidated()) {
			var cap_object = getCapSetterObject(level);

			var cap_keys = Object.keys(cap_object);
			for (var i=0; i < cap_keys.length; i++) {
				var key = cap_keys[i];
				var value = cap_object[key];

				var setter = {};
				var setter_key = "profile." + key;
				setter[setter_key] = value;
				Meteor.users.update(Meteor.user()._id, {$set : setter});
			}

			Meteor.users.update(Meteor.user()._id, {$set: {'profile.level': level}});
		}
	},

	'setXP': function(value) {
		if (adminValidated()) {
			Meteor.users.update(Meteor.user()._id, {$set: {'profile.xp': value}});
		}
	},

	'resetDailyDrop': function() {
		if (adminValidated()) {
			Meteor.users.update(Meteor.user()._id, {$set: {'profile.last_drop': moment().add(-1, "days")._d.toISOString()}});
		}
	},

	'updateDailyDropCount': function(value) {
		if (adminValidated()) {
			admin_settings.daily_drop_count = value;
		}
	},

	'updateCrateDropCount': function(value) {
		if (adminValidated()) {
			admin_settings.crate_drop_count = value;
		}
	},

	'generateForSale': function() {
		if (adminValidated()) {
			generateItemsForSale(Meteor.userId(), "platinum", admin_settings.daily_drop_count);
		}
	},

	'clearUnclaimed': function() {
		if (adminValidated()) {
			items.remove({'owner': Meteor.user()._id, 'status': "unclaimed"});
		}
	},

	'clearForSale': function() {
		if (adminValidated()) {
			items.remove({'owner': Meteor.user()._id, 'status': "for_sale"});
		}
	},

	'generateNPC': function(attribute_id) {
		if (adminValidated()) {
			gallery_object = galleries.findOne({'owner_id': Meteor.userId()});

			if (gallery_object)
				createNPC(gallery_object, attribute_id, 0);
		}
	},

	'setBankBalance': function(value) {
		if (adminValidated()) {
			Meteor.users.update(Meteor.userId(), {$set: {'profile.bank_balance': value}});
		}
	},

	'getAdminData': function() {
		var user_object = Meteor.user();

		if (user_object) {
			return {
				'npcs': attributes.find({'type': "primary"}).fetch(),
				'player_level': user_object.profile.level,
				'player_xp': user_object.profile.xp,
				'daily_drop_count': admin_settings.daily_drop_count,
				'crate_drop_count': admin_settings.crate_drop_count,
				'bank_balance': user_object.profile.bank_balance
			}
		}
	}
})