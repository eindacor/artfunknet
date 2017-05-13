Template.artExpertKnowledgeModal.helpers({
	'knowledge_tier': function(knowledge_object) {
		var knowledge_array = [];
		for (var i=0; i<knowledge_types.length; i++) {
			knowledge_array.push({
				'amount': knowledge_object[knowledge_types[i]],
				'name': knowledge_types[i].replace("_", " "),
				'type': knowledge_types[i]
			})
		}

		return knowledge_array;
	}
})

Template.artExpertKnowledgeModal.events({
	'click #accept-button' : function(element) {
		$('.template-modalTemplate').remove();
	}
})