const methods_bootstrap = {
    dialog_open: function(target, backdrop = 'static'){
        const element = document.querySelector(target);
        let modal = bootstrap.Modal.getInstance(element);
        if( !modal )
            modal = new bootstrap.Modal(element, { backdrop: backdrop, keyboard: false });
        modal.show();
    },
    dialog_close: function(target){
        const element = document.querySelector(target);
        let modal = bootstrap.Modal.getInstance(element);
        if( modal )
            modal.hide();
    },
    panel_open: function(target){
        var element = document.querySelector(target);
        var collapse = bootstrap.Collapse.getInstance(element);
        if( !collapse )
            collapse = new bootstrap.Collapse(element, { toggle: false });
        collapse.show();
    },
    panel_close: function(target){
        var element = document.querySelector(target);
        var collapse = bootstrap.Collapse.getInstance(element);
        if( !collapse )
            collapse = new bootstrap.Collapse(element, { toggle: false });
        collapse.hide();
    },
    progress_open: function(title = '少々お待ちください。', backdrop){
        this.$root.progress_title = title;
        this.dialog_open('#progress', backdrop);
    },
    progress_close: function(){
        this.dialog_close('#progress');
    },
    tab_select: function(target){
        var element = document.querySelector("a[href='" + target + "']");
        var tab = bootstrap.Tab.getInstance(element);
        if( !tab )
            tab = new bootstrap.Tab(element);
        tab.show();
    },
    toast_show: function(message, level = "success"){
        if( level == 'message' )
            siiimpleToast.message(message, { position: 'top|right' });
        else if( level == 'alert' )
            siiimpleToast.alert(message, { position: 'top|right' });
        else
            siiimpleToast.success(message, { position: 'top|right' });
    },
    clip_paste: async function(){
    	return navigator.clipboard.readText();
    },
    clip_copy: async function(text){
    	return navigator.clipboard.writeText(text);
    },
    datgui_add: function (property, p1, p2, p3) {
        var ctrl = window.datgui.add(this, property, p1, p2, p3);
        this.$watch(property, (v) => ctrl.setValue(v));
    },
    datgui_addColor: function (property) {
        var ctrl = window.datgui.addColor(this, property);
        this.$watch(property, (v) => ctrl.setValue(v));
    },
};

const mixins_bootstrap = {
    methods: methods_bootstrap
}
