Template.staff.helpers({
	'staff' : function() {
		return [{
			"name":"test1",
			"stats":[
				{
					"type":"benefactor", 
					"proficiency": 1
				}, {
					"type":"historian", 
					"proficiency": .5
				}, {
					"type":"auctioneer",
					"proficiency": 0.1
				}
			],
			"upkeep": 1000,

		},{
			"name":"test2",
			"stats":[
				{
					"type":"benefactor", 
					"proficiency": 0.5
				}
			],
			"upkeep": 250,
		}];
	}
})

Template.staffMember.helpers({
	// 'name' : function(artwork_id) {
	// 	return items.findOne({'artwork_id': artwork_id, 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'auctioned', 'won']}}) != undefined
	// },

	// 'quest_target' : function(quest_object) {
	// 	var target_info = [];
	// 	for (var i=0; i<quest_object.target.length; i++)
	// 		target_info.push(artworks.findOne(quest_object.target[i]));

	// 	return target_info;
	// },

	// 'hasCompleted' : function(quest_id) {
	// 	var quest_object = quests.findOne(quest_id)

	// 	var targets_found = 0;
	// 	for (var i=0; i < quest_object.target.length; i++) {
	// 		if (items.findOne({'artwork_id': quest_object.target[i], 'owner': Meteor.userId(), 'status': {$nin: ['unclaimed', 'for_sale', 'won']}}) != undefined)
	// 			targets_found++;
	// 	}

	// 	return targets_found >= quest_object.min_requirement;
	// },

	// 'artwork_rarity' : function(artwork_id) {
	// 	return artworks.findOne(artwork_id).rarity;
	// }
})