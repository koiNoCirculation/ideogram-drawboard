顶层界面设计: 
配色：蓝色+白色
index.tsx: 
应用首页，分左右两边栏，左边栏占1/3, 从上到下显示最近的设计列表，先用"A lone sailboat on calm water at sunset.", "A medium-shot photograph of a barista pouring latte art in a cozy cafe", "an isometric illustration of a tiny city floating in the clouds"占位。右边占2/3, 从上到下为：标题: "Enter the description of your dreamed image", 下方为文本框, 默认占位符为: "a golden retriever on a skateboard"。文本框默认占满剩余区域。最下方为按钮：开始设计。

design.tsx:
用户设计图片的页面，分左右两边蓝，左边栏为工具栏，由图标组成，目前有2个工具：添加文字(使用T字的图标)，添加对象(使用一个照片的图标)。右边自上到下显示一个标题（可编辑），显示一个画布。

index.tsx为默认页面，导航逻辑为：点击开始设计，进入design.tsx. design.tsx点击返回回到index.tsx.
