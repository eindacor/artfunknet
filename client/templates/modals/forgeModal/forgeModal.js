var forge_data_tracker = new Tracker.Dependency;
var forge_data = undefined;

Template.forgeModal.helpers({
	'contract_count': function() {
		return forgery_contracts.find({'owner_id': Meteor.userId()}).count();
	},

	'selected_forgery_contract_id': function() {
		getSelectedForgeryContractIdTracker().depend();
		return getSelectedForgeryContractId();
	},

	'forgery_cost': function() {
		forge_data_tracker.depend();
		if (forge_data != undefined) {
			return forge_data.forgery_cost;
		}
	},

	'expected_forgery_heat': function() {
		forge_data_tracker.depend();
		if (forge_data != undefined) {
			return forge_data.expected_forgery_heat;
		}
	},

	'forge_data': function(item_id) {
		getSelectedForgeryContractIdTracker().depend();
		if (getSelectedForgeryContractId() != undefined) {
			Meteor.call('getForgeData', item_id, getSelectedForgeryContractId(), function(error, result) {
				if (error) {
					console.log(error)
				}
				else {
					forge_data = result;
					forge_data_tracker.changed();
				}
			})
		}
	},

	'getExpectedForgeryHeat': function(item_id) {
		forgery_cost_tracker.depend();
		getSelectedForgeryContractIdTracker().depend();
		Meteor.call('getExpectedForgeryHeat', item_id, getSelectedForgeryContractId(), function(error, result) {
			if (error) {
				console.log(error)
			}
			else {
				forgery_heat = result;
			}
		})

		return forgery_heat;
	}
})

Template.forgeModal.rendered = function() {
	forge_data = undefined;
}

Template.forgeModal.events({
	'click #forge-item': function(event) {
		var item_id = $(event.target).data().item_id;
		if (getSelectedForgeryContractId() != undefined) {
			Meteor.call('forgeItem', item_id, getSelectedForgeryContractId(), function(error) {
				if (error) {
					console.log(error);
				}

				setSelectedForgeryContractId(undefined);
				getSelectedForgeryContractIdTracker().changed();
			})
		}
	}
})