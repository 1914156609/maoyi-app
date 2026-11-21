<template>
  <div class="app-container">
    <el-row :gutter="15">
      <el-form ref="formRef" :model="formData" :rules="rules" size="default" label-width="100px">
        <el-col :span="24">
          <el-row justify="center" align="middle" :gutter="15">
            <el-col :span="24">
              <el-form-item label="单行文本" prop="field103">
                <el-input v-model="formData.field103" type="text" placeholder="请输入单行文本" clearable
                  :style="{width: '100%'}"></el-input>
              </el-form-item>
            </el-col>
            <el-col :span="24">
              <el-form-item label="按钮" prop="field102">
                <el-button type="primary" icon="Search" size="default"> 主要按钮 </el-button>
              </el-form-item>
            </el-col>
          </el-row>
        </el-col>
        <el-col :span="24">
          <el-form-item label="颜色选择" prop="field104" required>
            <el-color-picker v-model="formData.field104" size="default"></el-color-picker>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label-width="120px" label="单行文本" prop="field105">
            <el-input v-model="formData.field105" type="text" placeholder="QA输入" clearable
              prefix-icon='Search' suffix-icon='Check' :style="{width: '100%'}">
              <template #prepend>￥</template>
              <template #append>元</template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="下拉选择" prop="field106">
            <el-select v-model="formData.field106" placeholder="请选择下拉选择" filterable clearable
              :style="{width: '100%'}">
              <el-option v-for="(item, index) in field106Options" :key="index" :label="item.label"
                :value="item.value" :disabled="item.disabled"></el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="级联选择" prop="field107">
            <el-cascader v-model="formData.field107" :options="field107Options" :props="field107Props"
              :style="{width: '100%'}" :show-all-levels="false" placeholder="请选择级联选择" filterable
              clearable></el-cascader>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="计数器" prop="field108">
            <el-input-number v-model="formData.field108" placeholder="计数器" step-strictly
              controls-position=right></el-input-number>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="多选框组" prop="field109">
            <el-checkbox-group v-model="formData.field109" size="default">
              <el-checkbox v-for="(item, index) in field109Options" :key="index" :value="item.value"
                :disabled="item.disabled">{{item.label}}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="滑块" prop="field110" required>
            <el-slider :min='0' :max='10' :step='1' v-model="formData.field110" range
              :show-stops="true"></el-slider>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="评分" prop="field111">
            <el-rate v-model="formData.field111" :max='5' allow-half show-score></el-rate>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="日期选择" prop="field112">
            <el-date-picker type="datetime" v-model="formData.field112" format="YYYY-MM-DD HH:mm:ss"
              value-format="YYYY-MM-DD HH:mm:ss" :style="{width: '100%'}" placeholder="请选择日期选择"
              clearable></el-date-picker>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="日期范围" prop="field113">
            <el-date-picker type="monthrange" v-model="formData.field113" format="YYYY-MM"
              value-format="YYYY-MM" :style="{width: '100%'}" start-placeholder="开始日期" end-placeholder="结束日期"
              range-separator="至" clearable></el-date-picker>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="颜色选择" prop="field114" required>
            <el-color-picker v-model="formData.field114" size="default" show-alpha
              color-format="rgba"></el-color-picker>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="开关" prop="field115" required>
            <el-switch v-model="formData.field115" active-text="QA开" inactive-text="QA关"></el-switch>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="上传" prop="field116" required>
            <el-upload ref="field116Ref" v-model:file-list="field116fileList" :action="field116Action"
              :auto-upload="false" multiple :before-upload="field116BeforeUpload">
              <el-button size="small" type="primary" icon="Upload">点击上传</el-button>
              <template #tip>
                <div class="el-upload__tip">只能上传不超过 2MB 的文件</div>
              </template>
            </el-upload>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="单行文本" prop="field117">
            <el-input v-model="formData.field117" type="text" placeholder="请输入单行文本" clearable
              :style="{width: '100%'}"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item>
            <el-button type="primary" @click="submitForm">提交</el-button>
            <el-button @click="resetForm">重置</el-button>
          </el-form-item>
        </el-col>
      </el-form>
    </el-row>
  </div>
</template>
<script setup>
const {
  proxy
} = getCurrentInstance()
const formRef = ref()
const data = reactive({
  formData: {
    field103: undefined,
    field102: undefined,
    field104: "#409eff",
    field105: undefined,
    field106: "",
    field107: [
      [1, 2]
    ],
    field108: 3,
    field109: [],
    field110: [1, 9],
    field111: 0.5,
    field112: "2026-11-18 09:30:00",
    field113: ["2026-11", "2026-12"],
    field114: "#ff0000",
    field115: "no",
    field116: null,
    field117: undefined,
  },
  rules: {
    field103: [{
      required: true,
      message: "请输入单行文本",
      trigger: 'blur'
    }],
    field105: [{
      required: true,
      message: "QA输入",
      trigger: 'blur'
    }],
    field106: [{
      required: true,
      message: "请选择下拉选择",
      trigger: 'change'
    }],
    field107: [{
      required: true,
      type: 'array',
      message: "请至少选择一个field107",
      trigger: 'change'
    }],
    field108: [{
      required: true,
      message: "计数器",
      trigger: 'blur'
    }],
    field109: [{
      required: true,
      type: 'array',
      message: "请至少选择一个field109",
      trigger: 'change'
    }],
    field111: [{
      required: true,
      message: "评分不能为空",
      trigger: 'change'
    }],
    field112: [{
      required: true,
      message: "请选择日期选择",
      trigger: 'change'
    }],
    field113: [{
      required: true,
      type: 'array',
      message: "请至少选择一个field113",
      trigger: 'change'
    }],
    field117: [{
      required: true,
      message: "请输入单行文本",
      trigger: 'blur'
    }, {
      pattern: new RegExp( ^ QA[0 - 9] + $),
      message: "仅允许QA加数字",
      trigger: 'blur'
    }],
  }
})
const {
  formData,
  rules
} = toRefs(data)
const field106Options = ref([{
  "label": "选项二",
  "value": 2
}, {
  "label": "选项一",
  "value": 1
}])
const field107Options = ref([{
  "id": 1,
  "value": 1,
  "label": "选项1",
  "children": [{
    "id": 2,
    "value": 2,
    "label": "选项1-1"
  }]
}])
const field109Options = ref([{
  "label": "选项一",
  "value": 1
}, {
  "label": "选项二",
  "value": 2
}])
// 上传请求路径
const field116Action = ref("/qa-upload-preview")
// 上传组件实例
const field116Ref = ref()
// 上传文件列表
const field116fileList = ref([])
// props设置
const field107Props = ref({
  "multiple": true
})

function getField107Options() {
  // TODO 接入业务接口后替换 field107Options.value；初始保留设计器选项。
  return field107Options.value
}

function field116BeforeUpload(file) {
  const isRightSize = file.size / 1024 / 1024 <= 2
  if (!isRightSize) proxy.$modal.msgError("文件大小超过 2MB")
  return isRightSize
}

function field116SubmitUpload() {
  field116Ref.value?.submit()
}
/**
 * @name: 表单提交
 * @description: 表单提交方法
 * @return {*}
 */
function submitForm() {
  formRef.value.validate((valid) => {
    if (!valid) return
    // TODO 提交表单
  })
}
/**
 * @name: 表单重置
 * @description: 表单重置方法
 * @return {*}
 */
function resetForm() {
  formRef.value.resetFields()
}

</script>
<style>
.el-rate {
  display: inline-block;
  vertical-align: text-top;
}

.el-upload__tip {
  line-height: 1.2;
}

</style>
