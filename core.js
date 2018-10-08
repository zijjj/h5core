/**
 * H5活动核心JS 此JS依赖jQuery 和 animate.css
 *
 * log:2016-06-22 ver1.0.0
 * 1. 改为<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0">形式，不再需要设置viewport的js
 * 2. 对库文件进行更好的封装，提供 $$ 语法糖来访问SR_H5CORE
 *
 * log:2016-08-10 ver1.0.1
 * 1. 修改initIscroll方法，可针对单个iscroll进行初始化，并设置单个iscroll的opt配置项
 *    如果参数为空初始化所有iscroll，如果第一个为查询字符串 则只初始化查询字符串对应的iscroll
 * 2. 添加自定义加载遮罩层 初始化参数preLoadCustom 接受查询字符串，默认使用框架自带的遮罩层；preLoadTime为初始化完成后关闭遮罩层的时间，默认1毫秒
 *    需在init初始化前创建 加载弹层样式模板 书写样式必须为 #main:before、#main:after
 *    <script type="text" id="loading">
 *        #main:after{content:'';position:fixed;left:0;top:0;width:100%;height:100%;background:#fff url(images/loading2.gif) no-repeat 50%; background-size:3rem}
 *    </script>
 * 3. 给showErr方法添加了closeback配置项，用来设置关闭按钮的回调函数
 * 4. 去掉了events方法中事件的300毫秒延迟，因为这样会导致touchmove等需要连续触发的事件失败
 *
 * log:2016-11-2 ver1.0.2
 * 1. 修改计算全局缩放系数算法，较之前版本更精准
 * 2. 将html的fontSize缩放系数改为全局缩放系数，更好的兼容设计稿内容区的字号 详细原因查看注释
 * 3. 音乐预处理函数中增加了判断cookie的处理，如果cookie有值，即便autoplay也不会自动播放音乐（这个功能还没有完善，只能说可以用了）
 * 4. 增加config.remReference配置项目，用来设置rem字号缩放是按照什么标准进行缩放 模式使用zoom全局缩放系数
 * 5. initIscroll方法增加了 refresh、scrollMove、scrollEnd 三个回调方法，分别对应iscroll的相应回调，主要是用在存储列表内容使用的，该方案还不太成熟（参考恒天讲堂项目）
 * 6. 增加了浏览器前缀参数 $$.prefix
 * 7. 增加了非微信端音乐自动播放问题
 * 8. preventTouch方法增加了by参数，参考events方法
 *
 * log:2017-05-18 ver1.0.3
 * 1.修改dhback函数，参数可以接受对象和数组类型，并修复由于动画时间冒泡而导致的BUG
 *   a.对象类型: {ele: '.img1-1', callback: function () {}}
 *   b.数组类型: [{ele: '.img1-1', callback: function () {}}, {ele: '.img1-1', callback: function () {}}]
 *
 * log:2017-06-06 ver1.0.4
 * 1.增加预加载图片配置项 progress，只有当 config.preLoadCustom 为true时可用；由于ready函数是在所有图片加载完后执行，所以加载完成事件可写在ready函数中；具体含义可查看注释（可参考TCL内宣项目）
 *   使用方法：$$.init({
 *			pageWidth: 750,
 *			pageHeight: 1180,
 *			preLoadCustom: "#loading",
 *			progress: function (i) { i表示每次的进度 值为：0~1的小数
 *				$(".progress").width(100 * i + "%");
 *			}
 *		});
 */
;(function(window){
    // 获取指定名称的cookie的值
    function getCookie(objName) {
        var arrStr = document.cookie.split("; ");
        for (var i = 0; i < arrStr.length; i++) {
            var temp = arrStr[i].split("=");
            if (temp[0] == objName)
                return unescape(temp[1]);
        }
    }

    //创建加载遮罩层样式
    var hidePageStyle = document.createElement("style");

    //预执行数组
    var readList = [];

    var SR_H5CORE = {
        config : {
            pageWidth : 640, //稿件宽度
            pageHeight : 1000, //稿件高度
            remReference : "zoom", //rem字号缩放时的参照物 默认是按照全局系数缩放
            stopScroll : true, //是否禁止滑动屏幕
            lanscape : false, //是否创建禁止横屏提示
            preLoad : true, //是否创建预加载遮罩层，防止图片突然变大的BUG
            preLoadTime : 1, //所有图片加载完后关闭loading提示层的时间 单位毫秒
            preLoadCustom: false, //是否使用自定义加载遮罩层，需在CSS文件书写样式，格式必须为 #main:before、#main:after
            progress: $.noop, //图片预加载进度函数，每加载成功一个图片调用一次
            hidePageClass : ".page" //需要隐藏的元素的选择符，只支持CSS的选择符，与preLoad属性配合使用，如果preLoad为false，该属性不起作用
        },
        winWidth : $(window).width(), //页面宽度
        winHeight : $(window).height(), //页面高度
        zoom : 1, //.page-con-auto与设备的比例
        pageZoom : 1, //设计稿与设备的缩放比例（.page-con-top/.page-con-bottom使用）
        isAndroid : navigator.userAgent.indexOf('Android')>-1, //是否为安卓机
        isWeixin : navigator.userAgent.toLowerCase().match(/MicroMessenger/i) == 'micromessenger',//是否在微信打开
        musicList : {},
        iscrollList : {},
        prefix : (function getVendorPrefix() {
            var body = document.body || document.documentElement,
                style = body.style,
                vendor = ['webkit', 'moz', 'ms', 'o'],
                i = -1;

            while (++i < vendor.length) {
                if (typeof style[vendor[i] + 'Transition'] === 'string') {
                    return vendor[i];
                }
            }
            return "";
        })(),
        ready : function (fun) {
            /**
             * 预备事件，表示页面尺寸已经初始化完成
             * 参数是一个函数，将该函数推入预执行数组中
             */
            typeof fun == "function" && readList.push(fun);
        },
        initPageHeight : function () {
            //初始化页面.page-con-auto尺寸
            var self = this,
                left = 0,
                top = 0,
                height = self.config.pageHeight;

            if(self.config.pageWidth > self.winWidth){
                self.pageZoom = self.config.pageWidth / self.winWidth;
                self.config.pageWidth = Math.floor(self.config.pageWidth / self.pageZoom);
                self.config.pageHeight = Math.floor(self.config.pageHeight / self.pageZoom);
            }

            /**
             * 创建预加载弹层
             */
            if(self.config.preLoadCustom) {
                hidePageStyle.innerHTML += $(self.config.preLoadCustom).html();
            }else{
                hidePageStyle.innerHTML += "#main:before{content:'\u6B63\u5728\u52A0\u8F7D\u8BF7\u7A0D\u540E';position:fixed;z-index:1;left:0;top:54%;width:100%;text-align:center;font-size:.22rem;color:#666;}";
                hidePageStyle.innerHTML += "#main:after{content:'';position:fixed;left:0;top:0;width:100%;height:100%;background:#fff url(http://static.sinreweb.com/common/images/loading3.gif) no-repeat 50%; background-size:.4rem;}";
            }

            if(self.config.pageHeight <= self.winHeight){
                self.zoom = self.pageZoom;
                left = (self.winWidth-self.config.pageWidth) / 2;
                top = (self.winHeight-self.config.pageHeight) / 2;
                $(".page-con-auto").css({width: self.config.pageWidth, height: self.config.pageHeight, left: left, top: top});
            }else{
                var _zoom = self.config.pageHeight / self.winHeight;
                self.config.pageWidth = Math.floor(self.config.pageWidth / _zoom);
                self.config.pageHeight = Math.floor(self.config.pageHeight / _zoom);
                left = (self.winWidth - self.config.pageWidth) / 2;
                top = (self.winHeight - self.config.pageHeight) / 2;
                $(".page-con-auto").css({width:self.config.pageWidth, height:self.config.pageHeight, left: left, top: top});
                self.zoom = (self.pageZoom == 1) ? _zoom : (height / self.config.pageHeight);
            }

            /**
             * 设置HTML标签的字号，为rem做准备
             * 默认缩放系数为全局缩放系数（如果设置self.config.remReference不为"zoom"，则按照页面缩放系数）
             * 因为.page-con-top/.page-con-bottom里一般只是一些图片性的装饰元素，一般不会单独设置rem使用默认尺寸即可
             * 所以为了保证内容区域的字号完整性，将采用全局缩放系数
             */
            if(self.config.remReference == "zoom") {
                $("html").css({fontSize: 100 / self.zoom});
            }else {
                if(self.pageZoom > 1 ){
                    $("html").css({fontSize: 100 / self.pageZoom});
                }else{
                    $("html").css({fontSize: 100 / (self.config.pageWidth / self.winWidth)});
                }
            }

            //创建禁止横屏提示
            self.config.lanscape && $("<div id=\"lanscape\"></div>").appendTo("body");

            /**
             * 图片预加载处理
             * */
            var count = imgNum = $(".page img").length,
                currentProgress = 0;
            (function _animate() {
                var completeProgres = (count - imgNum) / count;
                currentProgress = (currentProgress + 0.01) < completeProgres ? (currentProgress + 0.01) : completeProgres;
                if (Math.floor(currentProgress * 100) < 100) {
                    self.config.progress(currentProgress);
                    setTimeout(_animate, 20);
                } else {
                    setTimeout(function () {
                        self.config.progress(1);
                        setTimeout(function () {
                            playReadList();
                        }, 200);
                    }, 20);
                }
            })();

            /**
             * 初始化图片尺寸和所有直接子元素的坐标
             * 初始化.page-con-auto中所有直接子元素的坐标，需设置 data-position="200,150",属性{200:表示left,150:表示top}
             * 如果图片设置了.w100类，则不会重置尺寸
             */
            $(".page *").each(function (index, element) {
                if(element.tagName == "IMG"){
                    var newimg = new Image();
                    newimg.onload = function () {
                        if($(element).parents(".page-con-auto").length > 0){
                            //.page-con-auto里的图片如果没有单独再设置尺寸,将根据全局缩放指数缩放
                            if(element.width == this.width && element.height == this.height){element.width = this.width / self.zoom}
                        }else{
                            //.page-con-all-top,.page-con-all-bottom里的图片如果没有单独再设置尺寸，将根据页面缩放指数缩放
                            if(element.width == this.width && element.height == this.height){element.width = this.width / self.pageZoom}
                        }
                        self.initEleSize(element);

                        //删除通过hidePageClass属性创建的样式表
                        --imgNum;
                    }
                    newimg.onerror = function(){
                        //删除通过hidePageClass属性创建的样式表
                        --imgNum;
                    }
                    newimg.src = element.src;
                    newimg = null;
                }else{
                    self.initEleSize(element);
                }
            });

            //初始化页面上的视频尺寸，保证全屏可以显示（当视频需要内嵌式播放时使用，且只能在IOS中实现，且视频需设置 webkit-playsinline 属性）
            if(self.winHeight > self.config.pageHeight){
                $(".page-video video").css({width:"auto",height:"100%",marginLeft:(self.config.pageWidth-self.config.pageWidth)/2});
            }else{
                $(".page-video video").css({width:"100%",height:"auto"});
            }

            /**
             * 执行预备函数
             * 该函数默认会在所有图片加载完后执行，这样可以确保ready函数中可以获取准确的图片尺寸
             * 如果将config.preLoad属性设置为false，会在初始化完.page-con-auto的尺寸后就执行，但是这样ready函数中获取的图片尺寸有可能会不准确
             */
            function playReadList(){
                setTimeout(function () {
                    $(hidePageStyle).remove();
                    for(var i=0;i<readList.length;i++){
                        readList[i].call();
                    }
                }, self.config.preLoadTime);
            }
            if(!self.config.preLoad || imgNum == 0) {playReadList();}
        },
        initEleSize : function (element) {
            /**
             * 初始化元素的位置和尺寸
             * 尺寸如果只想设置第一位 可写作 data-size="640,auto"
             */
            var self = this,
                size = $(element).data("size"),
                position = $(element).data("position"),
                $elementParent = $(element).parentsUntil(".page",".page-con-all-top,.page-con-all-bottom");
            if(typeof position === "string" && position != ""){
                position = position.split(",");
                if(position.length < 2){
                    console.log("元素："+ $(element).selector + "的 data-position 属性必须有两个值");
                    return;
                }
                if($elementParent.length == 1){
                    var parentW = $elementParent.width(),
                        parentH = $elementParent.height(),
                        left = parseInt(position[0]) / self.pageZoom / parentW * 100 + "%",
                        top = parseInt(position[1]) / parentH * 100 + "%";
                    $(element).css({position: "absolute", left: left, top: top});
                }else{
                    var left = parseInt(position[0]) / self.zoom / self.config.pageWidth * 100 + "%",
                        top = parseInt(position[1]) / self.zoom / self.config.pageHeight * 100 + "%";
                    $(element).css({position: "absolute", left: left, top: top});
                }
            }
            if(typeof size === "string" && size != ""){
                size = size.split(",");
                if($elementParent.length == 1){
                    $(element).css({width: size[0] / self.pageZoom, height: size[1] / self.pageZoom});
                }else{
                    $(element).css({width: size[0] / self.zoom, height: size[1] / self.zoom});
                }
            }
        },
        btnClick : function(ele,callback,animation){
            if(!animation) animation = 'animated rubberBand';
            //按钮单击事件
            if(!$(ele).data("click")){
                $(ele).data("click",1);
                //webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend
                $(ele).one("webkitAnimationEnd", function(){
                    $(ele).removeClass(animation);
                    $(ele).data("click",0);
                    if(callback)callback.call(ele);
                });
                $(ele).addClass(animation);
            }
        },
        showErr : function (opt) {
            /**
             * 错误弹窗 HTML结构如下：
             * <div class="page error-box hidden">
             *         <div class="page-con-auto">
             *             <img data-position="10,10" src="error.png" class="icon">
             *             <div data-position="0,100" class="msg"></div>
             *             <img data-position="10,10" src="close.png" class="close">
             *             <img data-position="10,10" src="close2.png" class="close2">
             *         </div>
             * </div>
             */

            var self = this;
            opt = $.extend({
                icon : '', //弹窗上的提示图标 默认error.png
                msg : '', //弹窗的提示文本 支持HTML
                closeBtn : false, //是否显示右上角的叉
                btnTxt : '确定', //按钮上的文字
                stopClose : false, //是否不关闭弹层，直接执行回调函数，适用刷新页面时 如：location.reload();
                callback : $.noop,
                closeback : $.noop
            },opt||{});
            (opt.icon != "") && $('.error-box .icon').attr("src",opt.icon);
            $(":focus").blur();
            $('.error-box .msg').html(opt.msg);
            self.showPage({ele:'.error-box'});

            if(opt.closeBtn){
                if(!$(".error-box .close").data("handle")){
                    $('.error-box .close').data("handle",1).on('touchend', function () {
                        $('.error-box .close2').off("touchend");
                        self.hidePage({ele:'.error-box'});
                        opt.closeback.call(this);
                        return false;
                    });
                }
            }else{
                $('.error-box .close').remove();
            }

            $('.error-box .close2').text(opt.btnTxt).one('touchend', function () {
                if(opt.stopClose){
                    opt.callback.call(this);
                }else{
                    self.hidePage({ele:'.error-box'});
                    opt.callback.call(this);
                }
                return false;
            });
        },
        showLoad : function (txt) {
            /**
             * txt 参数为Loading时的提示语
             */
            txt = !txt ? "请稍后" : txt;
            if($(".loading-box").length==0 && $("#main").length==1){
                $('<div class="loading-box"><div class="loading"><p>'+ txt +'</p></div></div>').appendTo("#main");
            }
            $('.loading-box').show();
        },
        hideLoad : function () {
            $('.loading-box').hide();
        },
        preloadMusic : function () {
            //预处理声音
            var self = this;
            function initMusic(){
                $("audio").each(function () {
                    self.musicList[this.id] = this;
                    this.play();
                    this.pause();
                    this.autoplay && !getCookie("musicCookie") && this.play();
                });
            }
            if($$.isWeixin){
                document.addEventListener("WeixinJSBridgeReady", initMusic, false);
            }else{
                //非微信只有当用户点击下屏幕才可以自动播放音乐
                $(window).one("touchstart", initMusic);
            }
        },
        playMusic : function (id,load) {
            //播放声音
            load && this.musicList[id].load(); //如果需要从头播放，需要给load传true
            this.musicList[id].play();
        },
        pauseMusic : function (id) {
            //暂停声音
            document.getElementById(id).pause();
        },
        animation : function () {
            /**
             * 动画延迟、动画时间
             * 元素动画延迟需要设置 data-animation-delay="5000" 属性，单位为毫秒
             * 元素动画时间需要设置 data-animation-duration="2000" 属性，单位为毫秒
             *
             * 之所以用插入style的形式，是因为iphone 6s在设置了行内属性后，不起作用
             */
            var style = document.createElement("style");
            $(".animated").each(function (index) {
                var delay = $(this).data("animation-delay");
                if(typeof delay !== 'undefined' && typeof delay === "number"){
                    var _class = "ele-delay"+index;
                    $(this).addClass(_class);
                    style.innerHTML += "."+ _class + "{animation-delay:"+ parseFloat(delay/1000) +"s; -webkit-animation-delay:"+ parseFloat(delay/1000) +"s;}";
                }
                var duration = $(this).data("animation-duration");
                if(typeof duration !== 'undefined' && typeof duration === "number"){
                    _class = "ele-duration"+index;
                    $(this).addClass(_class);
                    style.innerHTML += "."+ _class + "{animation-duration:"+ parseFloat(duration/1000) +"s; -webkit-animation-duration:"+ parseFloat(duration/1000) +"s;}";
                }
            });
            document.getElementsByTagName("head")[0].appendChild(style);
        },
        includScript : function(url, opt){
            /*
             * 加载js函数
             * opt{ok:加载成功回调函数,err:加载失败回调函数}
             **/
            opt = $.extend(opt || {},{
                dataType: "script",
                cache: true,
                url: url
            });

            return $.ajax(opt).done(function (script, textStatus) {
                typeof opt.ok == "function" && opt.ok(script, textStatus);
            }).fail(function () {
                typeof opt.err == "function" && opt.err();
            });
        },
        dhback: function(opt){
            /**
             * 动画结束后的回调处理
             * 参数可以接受 对象类型: {ele: '.img1-1', callback: function () {}} 和 数组类型: [{ele: '.img1-1', callback: function () {}}, {ele: '.img1-1', callback: function () {}}]
             */
            var self = this;
            if($.isArray(opt)){
                $.each(opt, function () {
                    bindBuild(this);
                });
            }

            if($.isPlainObject(opt)){
                bindBuild(opt);
            }

            //绑定动画回调处理
            function bindBuild(obj){
                obj = $.extend({
                    ele: null, //触发动画的元素
                    callback: $.noop //动画执行完后的回调函数
                }, obj || {});

                $(obj.ele).on(self.prefix + 'AnimationEnd', function(event){
                    //防止动画事件冒泡影响代码逻辑
                    if(event.target === this){
                        obj.callback.call(this);
                    }
                });
            }
        },
        preventTouch : function (opt) {
            /**
             * 预防滑动的时候误点击 适用iscroll里的元素
             * ele 防止单击的元素
             * callback 单击后的操作
             *
             * 如果传递了by参数，this就是by参数指定的元素
             * 如果没有传递by参数，this就是ele指定的元素
             */
            opt = $.extend({
                ele : "",
                by: null,
                callback : $.noop
            },opt||{});
            var isMove = false,
                by = opt.by ? opt.by : null;

            $(opt.ele).on("touchmove", by, function () {
                isMove = true;
            }).on("touchend", by, function (event) {
                if(!isMove) {
                    opt.callback && opt.callback.call(this);
                }else{
                    isMove = false;
                }
                event.preventDefault();
                //return false; 如果返回false，会导致父元素的滑动效果取消
            });
        },
        ajax : function(opt){
            //封装的AJAX请求，防止重复提交
            var self = this;
            if(!$(opt.ele).data("isajax")){
                $(opt.ele).data("isajax",1);
                opt = $.extend(true,{
                    ele : "", //用来触发请求的元素，URL要以data-url的形式，写在该元素上
                    type : "post",
                    url : $(opt.ele).data("url"),
                    dataType:"json",
                    data : {},
                    loading : true, //是否显示Loading框
                    loadingTxt : "请稍后", //Loading框中的提示文本
                    timeout : 60000, //超时时间
                    beforeSend : $.noop,
                    callback : $.noop
                },opt||{});

                $.ajax({
                    type:opt.type,
                    url:opt.url,
                    dataType:opt.dataType,
                    data:opt.data,
                    timeout:opt.timeout,
                    beforeSend : function () {
                        /**
                         * 将获得焦点的表单元素失去焦点
                         * 作用是用来收回虚拟键盘
                         */
                        $(":focus").blur();
                        opt.loading && self.showLoad(opt.loadingTxt);
                        opt.beforeSend();
                    }
                }).done(function(data) {
                    self.hideLoad();
                    $(opt.ele).data("isajax",0);
                    opt.callback.call(opt.ele,data);
                }).fail(function(){
                    self.hideLoad();
                    $(opt.ele).data("isajax",0);
                });
            }
        },
        showPage : function(opt){
            /**
             * 显示指定页面
             * opt.ele:"#id|.class" 需要显示的元素
             * opt.pageDlay:0 页面多少毫秒后显示 默认0毫秒
             * opt.callback:$.noop 页面显示后的回调函数 this为页面元素的jquery对象
             * opt.callbackDlay:0 回调函数多少毫秒后执行 默认0毫秒
             */
            opt = $.extend({
                ele : '',
                pageDlay : 0,
                callback : $.noop,
                callbackDlay : 0
            },opt||{});
            setTimeout(function(){
                $(opt.ele).removeClass("hidden");
                setTimeout(function(){
                    opt.callback.call($(opt.ele));
                },opt.callbackDlay);
            },opt.pageDlay);
        },
        hidePage : function(opt){
            /**
             * 隐藏指定页面
             * opt.ele:"#id|.class" 需要显示的元素
             * opt.pageDlay:0 页面多少毫秒后显示 默认0毫秒
             * opt.callback:$.noop 页面显示后的回调函数 this为页面元素的jquery对象
             * opt.callbackDlay:0 回调函数多少毫秒后执行 默认0毫秒
             */
            opt = $.extend({
                ele : '',
                pageDlay : 0,
                callback : $.noop,
                callbackDlay : 0
            },opt||{});
            setTimeout(function(){
                $(opt.ele).addClass("hidden");
                setTimeout(function(){
                    opt.callback.call($(opt.ele));
                },opt.callbackDlay);
            },opt.pageDlay);
        },
        initIscroll : function(ele, opt){
            /**
             * 初始化iscroll
             *
             * 如果参数为空初始化所有iscroll，如果第一个为查询字符串:如".a"|"#b"|[".a","#b",".a .c"] 则只初始化查询字符串对应的iscroll，初始化单个iscroll时，可单独设置opt
             * 每个iscroll必须设置.iscroll类以及ID属性 如：<div class="iscroll" id="myscroll" data-iscroll-height=400></div>
             * 每个iscroll必须设置data-size属性，用来表示宽高 如：data-size=400,200
             * 初始化后可通过 SR_H5CORE.iscrollList.id名 的形式调用该iscroll 如：SR_H5CORE.iscrollList.myscroll
             * 如果需要下拉加载更多，需要把内容包裹在.iscroll-con-box类里，并且需要在.iscroll-con-box后面添加html结构 如下： pullUp需要和iscroll-con-box同级
             * <div class="pullUp" data-tpl="tpl-1" data-ajaxdata="id=5&name=张三" data-pagenumber="2" data-url="{:U(CONTROLLER_NAME . '/json_lists')}">
             *         <span class="pullUpIcon"></span><span class="pullUpLabel">向上滑动加载更多</span>
             * </div>
             * data-tpl="tpl-1"为模板引擎的id 参考laytpl.js
             */
            var self = this,
                iscrollEle = ".iscroll";

            if(typeof ele == "string"){
                iscrollEle = ele; //用来单独初始化
            }else if(typeof ele == "undefined" || !$.isEmptyObject(ele)){
                iscrollEle = ".iscroll";
                opt = ele || {};
            }
            $(iscrollEle).each(function (index, iscroll) {
                if($(iscroll).data("init") == 1){
                    return true;
                }else{
                    $(iscroll).data("init", 1).css({position:"relative", overflow:"hidden"}); //init=1表示已经初始化过

                    //加载iscroll.js
                    self.includScript("http://static.sinreweb.com/common/js/plugs/iscroll.js",{
                        ok: function () {
                            //初始化iscroll高度
                            $(iscroll).find(">*").wrapAll("<div class=\"iscroll-box\"></div>");
                            var $pullUpEl = $(iscroll).find(".pullUp"),
                                _opt = opt;
                            $$.iscrollList.enableLoad = (typeof opt.saveData == "undefined") ? true : (!!opt.saveData ? true : false);

                            if($pullUpEl.length > 0){
                                self.includScript("http://static.sinreweb.com/common/js/plugs/laytpl.js");
                                _opt = $.extend(true,{
                                    useTransition: true, //是否使用CSS3的transition属性来实现滚动
                                    hScrollbar : false, //是否显示水平滚动条
                                    //vScrollbar: false, 是否显示垂直滚动条
                                    //scrollbarClass : "myscrollbar", 自定义滚动条类
                                    //hideScrollbar: false, 不滚动的时候是否隐藏滚动条
                                    checkDOMChanges: true, //自动刷新DOM结构
                                    onRefresh: function () {
                                        if ($pullUpEl.is('.loadmore') && !$pullUpEl.data("disabledload")) {
                                            $pullUpEl.removeClass("flip loadmore");
                                            $pullUpEl.find('.pullUpLabel').html('向上滑动加载更多');
                                        }
                                        _opt.refresh.call(this);
                                    },
                                    onScrollMove: function () {
                                        //console.log('minY:'+this.minScrollY)
                                        //console.log('maxY:'+this.maxScrollY)
                                        //console.log('y:' + this.y)
                                        if(this.y < (this.maxScrollY - 80) && !$pullUpEl.is('.flip') && !$pullUpEl.data("disabledload") && $$.iscrollList.enableLoad) {
                                            $pullUpEl.addClass('flip');
                                            $pullUpEl.find('.pullUpLabel').html('释放加载更多');
                                        }
                                        _opt.scrollMove.call(this);
                                    },
                                    onScrollEnd: function () {
                                        enableLoad = true;
                                        if ($pullUpEl.is('.flip') && !$pullUpEl.data("disabledload") && !$pullUpEl.data("isajax") && $$.iscrollList.enableLoad) {
                                            $pullUpEl.addClass('loadmore');
                                            $pullUpEl.find('.pullUpLabel').html('加载中请稍后...');

                                            //下拉加载更多
                                            setTimeout(function () {
                                                self.loadMoreList({
                                                    pullUp : $pullUpEl,
                                                    iscroll : iscroll
                                                });
                                            },500);
                                        }
                                        _opt.scrollEnd.call(this);
                                    },
                                    refresh: $.noop, //额外的刷新回调函数
                                    scrollMove: $.noop, //额外的移动回调函数
                                    scrollEnd: $.noop //额外的移动结束回调函数
                                },opt || {});
                            }else{
                                _opt  = $.extend(true,{
                                    useTransition: true,
                                    hScrollbar : false,
                                    checkDOMChanges: true
                                },opt || {});
                            }
                            self.iscrollList[iscroll.id] = new iScroll(iscroll, _opt);
                        }
                    });
                }
            });
        },
        loadMoreList : function(opt){
            //下拉加载更多 依赖iscroll.js 参考蒙牛纯甄项目
            var self = this,
                $pullUpEl = opt.pullUp,
                tpl = $pullUpEl.data("tpl"), //模板ID
                datas = $pullUpEl.data("ajaxdata");

            opt = $.extend({
                data : datas+"&pageNumber="+$pullUpEl.data("pagenumber"),
                ele : $('.iscroll-con-box',opt.iscroll)
            }, opt||{});

            //下拉加载更多 AJAX 通信
            if(!$pullUpEl.data("disabledload")){
                self.ajax({
                    ele : opt.pullUp,
                    data : opt.data,
                    callback : function (data) {
                        if(($.isArray(data.data) && (data.data.length != 0)) || !$.isEmptyObject(data.data)){
                            $pullUpEl.data("pagenumber",data.page);
                            try{
                                var gettpl = document.getElementById(tpl).innerHTML;
                                laytpl(gettpl).render(data, function (html) {
                                    $(html).appendTo(opt.ele);
                                });
                            }catch (e){}
                            self.iscrollList[opt.iscroll.id].refresh();
                        }else{
                            //如果没有更多数据 隐藏加载gif 并禁止拉动刷新
                            $pullUpEl.removeClass('loadmore').data("disabledload",1);
                            $(".pullUpLabel",$pullUpEl).text("没有更多内容了");
                        }
                    }
                });
            }
        },
        uploadFile: function (opt) {
            /**
             * 封装微信上传图片
             * 此段代码参考蒙牛纯甄BBS项目
             * 上传按钮HTML结构 <label id="upload-file"><input type="file" name="upload-file[]" style="opacity:0;"></label>
             **/
            var self = this,
                opt = $.extend({
                    H5Button: $("#upload-file"), //上传图片按钮元素
                    imgLength : 1, //图片的数量 默认1张
                    imgSize : 5, //图片大小 默认5M
                    autoUploadImage : true, //安卓机型在选择了照片后，是否自动获取serverID,默认为 true 获取
                    errBox : function(errmsg){}, //错误处理函数，选择视频、图片大小超过限制会触发
                    chooseImageSuccess : function(src){}, //选择照片后的回调函数 src可直接赋值给img显示图片
                    uploadImageSuccess : function(serverId){} //上传照片回调函数，安卓需要用到该函数
                },opt||{});

            /**
             * 微信上传照片 安卓版使用
             * 只能一张一张的上传
             * 所以采用递归形式处理
             **/
            function uploadImage(){
                (function wx_uploadImg(localIds){
                    var localId = localIds.pop();
                    wx.uploadImage({
                        localId:localId,
                        isShowProgressTips:0,
                        success:function(res){
                            weixin.images.serverId.push(res.serverId); //返回的是服务器端图片的id

                            //执行上传成功回调函数 每上传成功一次，执行一次
                            opt.uploadImageSuccess(res.serverId);

                            //其他对serverId做处理的代码
                            if(localIds.length > 0){
                                wx_uploadImg(localIds);
                            }
                        }
                    })
                })(weixin.images.localId);
            }

            //如果是安卓手机的话
            if(self.isAndroid && self.isWeixin){
                //安卓使用微信API
                opt.H5Button.find("input[type='file']").remove();
                opt.H5Button.on('touchend',function(){
                    wx.chooseImage({
                        count: opt.imgLength,
                        success: function (res) {
                            /**
                             * 保存本地图片的id(由微信客户端提供) 返回的是一个数组
                             * 数组中的内容可以直接赋值到img的src属性
                             **/
                            weixin.images.localId = res.localIds;

                            //执行选择照片后的回调函数
                            if(opt.imgLength > 1){
                                //如果上传多图
                                for(var i=0; i<res.localIds.length; i++){
                                    opt.chooseImageSuccess(res.localIds[i]);
                                }
                            }else{
                                opt.chooseImageSuccess(res.localIds[0]);
                            }

                            //选择成功后是否自动开始上传，获取serverID
                            opt.autoUploadImage && uploadImage();
                        }
                    });
                });
            }else{
                //IOS使用HTML原生上传 input file 多图
                //如果上传多图
                opt.imgLength > 1 && opt.H5Button.find("input[type='file']").attr("multiple",true);

                opt.H5Button.find("input[type='file']").on('change',function (){
                    var oFile = this.files,
                        rFilter = /^(image\/bmp|image\/gif|image\/jpeg|image\/png|image\/tiff)$/i,
                        oReader = [];
                    for(var i=0; i<oFile.length; i++){
                        if (!rFilter.test(oFile[i].type)) {
                            opt.errBox("选择的图片格式不正确 请重新选择");
                            return;
                        }
                        if(oFile[i].size > opt.imgSize * 1024 * 1024){
                            opt.errBox("单张图片的大小不能大于"+opt.imgSize+"M");
                            return;
                        }
                    }

                    for(var i=0; i<oFile.length; i++){
                        oReader[i] = new FileReader();
                        oReader[i].onload = function(e){
                            //执行选择照片后的回调函数
                            opt.chooseImageSuccess(e.target.result);
                            opt.H5Button.find("input[type='file']").val(''); //清除file值，防止不能选重复的图片
                        }
                        oReader[i].readAsDataURL(oFile[i]);
                    }
                });
            }
        },
        flipImage : function (src, callback, maxSize) {
            /**
             * 翻转图片
             * 修复手机拍的照片方向不对的问题 依赖exif.js
             * src可接受图片url地址也可接受base64数据
             * callback接受翻转后的图片的base64数据
             * maxSize图片宽高的最大尺寸 默认1024
             **/
            this.includScript("http://static.sinreweb.com/common/js/plugs/exif.js",{
                ok : function () {
                    var orientation;
                    //EXIF js 可以读取图片的元信息 https://github.com/exif-js/exif-js
                    var imgEle = new Image();
                    imgEle.onload = function () {
                        EXIF.getData(this,function(){
                            orientation=EXIF.getTag(this,'Orientation');
                        });
                        getImgData(src,orientation,function(data){
                            //返回图片的base64
                            callback(data);
                        });
                    }
                    imgEle.src = src;
                }
            });

            var maxSize = maxSize ? maxSize : 1024;

            // @param {string} img 图片的base64
            // @param {int} dir exif获取的方向信息
            // @param {function} next 回调方法，返回校正方向后的base64
            function getImgData(img,dir,next){
                var image=new Image();
                image.onload=function(){
                    var degree=0,drawWidth,drawHeight,width,height;
                    drawWidth=this.naturalWidth;
                    drawHeight=this.naturalHeight;
                    //以下改变一下图片大小
                    var maxSide = Math.max(drawWidth, drawHeight);
                    if (maxSide > maxSize) {
                        var minSide = Math.min(drawWidth, drawHeight);
                        minSide = minSide / maxSide * maxSize;
                        maxSide = maxSize;
                        if (drawWidth > drawHeight) {
                            drawWidth = maxSide;
                            drawHeight = minSide;
                        } else {
                            drawWidth = minSide;
                            drawHeight = maxSide;
                        }
                    }

                    var canvas=document.createElement('canvas');
                    canvas.width=width=drawWidth;
                    canvas.height=height=drawHeight;
                    var context=canvas.getContext('2d');
                    //判断图片方向，重置canvas大小，确定旋转角度，iphone默认的是home键在右方的横屏拍摄方式
                    switch(dir){
                        //iphone横屏拍摄，此时home键在左侧
                        case 3:
                            degree=180;
                            drawWidth=-width;
                            drawHeight=-height;
                            break;
                        //iphone竖屏拍摄，此时home键在下方(正常拿手机的方向)
                        case 6:
                            canvas.width=height;
                            canvas.height=width;
                            degree=90;
                            drawWidth=width;
                            drawHeight=-height;
                            break;
                        //iphone竖屏拍摄，此时home键在上方
                        case 8:
                            canvas.width=height;
                            canvas.height=width;
                            degree=270;
                            drawWidth=-width;
                            drawHeight=height;
                            break;
                    }
                    //使用canvas旋转校正
                    context.rotate(degree*Math.PI/180);
                    context.drawImage(this,0,0,drawWidth,drawHeight);
                    //返回校正图片
                    next(canvas.toDataURL("image/png"));
                }
                image.src=img;
            }
        },
        events : function () {
            /**
             * 事件绑定
             * SR_H5CORE.events({
             *        event : "touchmove",
             *        list :[
             *             {ele: ".a", by: "img", callback: function () {}},
             *             {ele:".b", callback : function () {}}
             *        ]
             *  },{
             *        event : "touchend",
             *        list :[
             *             {ele: ".c", by: "img", callback: function () {}},
             *             {ele:".d", callback : function () {}}
             *        ]
             *  });
             *
             *  如果传递了by参数，this就是by参数指定的元素
             *  如果没有传递by参数，this就是ele指定的元素
             */
            var events = arguments;
            for(var i=0; i<events.length; i++){
                for(var x=0; x<events[i].list.length; x++){
                    (function(i,x){
                        var by = events[i].list[x].by ? events[i].list[x].by : null;
                        $(events[i].list[x].ele).on(events[i].event, by, function(event){
                            events[i].list[x].callback.call(this, event);
                            return false; //防止穿透 这样会导致当前元素onclick方法不执行 所以应该统一使用touchend事件
                        });
                    })(i,x);
                }
            }
        },
        init : function(config){
            var self = this;


            /**
             * 初始化配置项
             */
            self.config = $.extend(self.config,config||{});


            /**
             * 创建预加载弹层
             */
            if(self.config.preLoad && self.config.hidePageClass){
                var _class = self.config.hidePageClass.split(",");
                ////for(var i in _class){hidePageStyle.innerHTML += _class[i] +"{visibility:hidden}";} 忘记当初为什么使用visibility了，暂时不要删
                for(var i in _class){hidePageStyle.innerHTML += _class[i] +"{display:none}";}
                hidePageStyle.innerHTML += "#main{background:#fff;}";
                document.getElementsByTagName("head")[0].appendChild(hidePageStyle);
            }


            /**
             * DOM加载完成
             */
            $(function(){
                /**
                 * 初始化页面尺寸
                 * 初始化元素大小和位置
                 */
                self.initPageHeight();


                /**
                 * 初始化动画延迟与动画时间
                 */
                self.animation();


                /**
                 * 预处理音乐
                 * 所有audio元素必须设置.bgm类
                 * 如果audio元素设置autoplay则自动播放该音乐
                 */
                self.preloadMusic();


                /**
                 * 禁止手机滑动默认行为
                 * 如果给stopScroll传递true，则禁止手机滑动默认行为，默认为true
                 */
                if(self.config.stopScroll){
                    $("body,#main").css({height:"100%",overflow:"hidden"});
                    $("#main").css({height: self.winHeight});
                    $('body').on('touchmove', function (event) {
                        event.preventDefault();
                    });
                }else{
                    /**
                     * 设置#main的高度
                     * 防止有input的页面输入信息时导致的变形
                     */
                    $("#main").css({height: self.winHeight});
                }


                /**
                 * 识别二维码图片功能
                 * 需要使用该功能的图片必须设置.read-two-code
                 * ***********目前有BUG************
                 */
                var readTwoCodeTimeout = null,
                    startReadTwoCode = null;
                $(".read-two-code").on("touchstart", function () {
                    var that = this;
                    startReadTwoCode = setTimeout(function () {
                        if(!self.isAndroid){
                            $(that).css({width: "auto", margin: "-100rem", padding: "100rem", position: "relative", zIndex: 19860118});
                            clearTimeout(readTwoCodeTimeout);
                            readTwoCodeTimeout = setTimeout(function () {
                                $(that).css({width: $(that).attr("width"), margin: 0, padding: 0, zIndex: 0});
                            },1000)
                        }
                    },300);
                    return true;
                }).on("touchmove touchend", function () {
                    clearTimeout(startReadTwoCode);
                });


                /**
                 * 自定义进度条（预加载弹层）
                 * 先确保加载完背景后 再开始加载其他
                 */
                /*self.preloadImage(function(currentProgress){},function(){
                 $('.load').removeClass('none');
                 setTimeout(function(){
                 self.preloadImage(function(currentProgress){
                 $(".load span").text(parseInt(currentProgress*100)+"%");
                 $(".jd").css({width:currentProgress*75+"%"});
                 },
                 function(){
                 $(".load").addClass("zoomOut");
                 self.showPage({
                 ele:".page1",
                 dlay:500,
                 callback:function(){

                 }
                 });
                 },
                 ["images/1-1.png",
                 "images/1-2.png",
                 "images/1-3.png",
                 "images/1-4.png"],
                 20));
                 },600);
                 },[
                 "images/jdbg.png",
                 "images/jd.png"
                 ],0))*/
            });
        }
    };

    if(typeof $$ == "undefined"){
        window.SR_H5CORE = window.$$ = SR_H5CORE;
    }else{
        window.SR_H5CORE = SR_H5CORE;
    }

})(window);